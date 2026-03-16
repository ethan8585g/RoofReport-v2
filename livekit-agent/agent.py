"""
RoofReporterAI — Roofer Secretary AI Voice Agent
Powered by LiveKit Agents + LiveKit Inference

This agent answers inbound phone calls for roofing businesses.
It uses the customer's configured greeting, Q&A, and directory routing
to provide a professional AI receptionist experience.

Flow:
  1. Inbound call hits LiveKit phone number (+14849649758)
  2. Dispatch rule routes call to a new room (secretary-2-*)
  3. This agent joins the room and greets the caller
  4. Agent handles Q&A, routes to departments, takes messages
  5. After call, logs the call details to the RoofReporterAI API
"""

import os
import json
import logging
import aiohttp
from dotenv import load_dotenv
from livekit.agents import (
    JobContext, JobProcess, Agent, AgentSession, AgentServer,
    cli, inference, function_tool, RoomInputOptions
)
from livekit.plugins import silero

load_dotenv()

logger = logging.getLogger("roofer-secretary")
logger.setLevel(logging.INFO)

# ============================================================
# Rick's Roofing — Default configuration (customer_id=2)
# This is the primary deployment for dev@reusecanada.ca
# ============================================================
RICKS_ROOFING_CONFIG = {
    "customer_id": 2,
    "business_phone": "+17809833335",
    "agent_name": "Sarah",
    "agent_voice": "alloy",
    "greeting_script": (
        "Thank you for calling Rick's Roofing. This is Sarah. "
        "Are you calling for a new roof estimate or a repair today?"
    ),
    "common_qa": (
        "Q: How much is a new roof going to cost me?\n"
        "A: Every roof is a bit different, so I can't give you an exact price over the phone. "
        "However, once I get your address, our team will use satellite imagery to get a preliminary "
        "3D measurement. An estimator will then call you back with a solid baseline for the cost.\n\n"
        "Q: Do you just do replacements, or can you fix a small leak?\n"
        "A: We absolutely handle repairs as well as full replacements. To help our team prepare, "
        "is the leak currently causing interior damage, or is it a slower issue you've noticed over time?\n\n"
        "Q: How fast can you get someone out here? I have water coming in.\n"
        "A: For active leaks, we offer emergency dispatch and tarping services. We can usually get "
        "a crew out within a few hours. There is an upfront dispatch fee for emergency response, "
        "which I can send to your phone via a secure payment link right now. Would you like to proceed?\n\n"
        "Q: Do you offer financing or payment plans?\n"
        "A: Yes, we do have financing options available for full roof replacements. Our estimator can "
        "walk you through the different terms and monthly payment breakdowns during your consultation.\n\n"
        "Q: Are you guys fully licensed and insured?\n"
        "A: Yes, Rick's Roofing is fully licensed, bonded, and insured. Our estimators can provide "
        "our exact credentials and policy details when they speak with you."
    ),
    "general_notes": (
        "Handling Interruptions: If the caller goes on a tangent, validate their frustration briefly "
        "then steer back to data capture. Example: 'I completely understand why that's frustrating. "
        "Let's make sure we get this sorted out for you. To get started, what is the exact street address?'\n\n"
        "Address Collection: Always get the FULL address - street number, street name, city, and zip/postal code. "
        "If caller gives a partial address, politely ask for the missing components.\n\n"
        "Never Diagnose: You are a receptionist, not a roofing inspector. Never attempt to diagnose "
        "the cause of a leak or recommend specific materials over the phone.\n\n"
        "Latency Management: Use natural filler phrases like 'Okay, let me just type that in real quick...' "
        "or 'Perfect, pulling that up in our system now...' to mask any processing delays.\n\n"
        "Data Capture Priority: Always collect: 1) Full name, 2) Callback number, 3) Full property address, "
        "4) Type of service needed (replacement, repair, inspection, emergency)."
    ),
    "directories": [
        {"name": "Sales", "phone_or_action": "take message", "special_notes": "New estimates and quotes"},
        {"name": "Service", "phone_or_action": "take message", "special_notes": "Repairs and maintenance"},
        {"name": "Parts", "phone_or_action": "take message", "special_notes": "Materials and supplies"},
    ],
}


# ============================================================
# Configuration loader — pulls config from room metadata,
# API, or falls back to Rick's Roofing defaults
# ============================================================
async def get_agent_config(ctx: JobContext) -> dict:
    """Extract customer config from room metadata, API, or defaults."""
    config = dict(RICKS_ROOFING_CONFIG)  # Start with defaults

    # Try to get customer_id from room name (format: secretary-{customer_id}-...)
    room_name = ctx.room.name or ""
    customer_id = None
    if room_name.startswith("secretary-"):
        parts = room_name.split("-")
        if len(parts) >= 2:
            try:
                customer_id = int(parts[1])
            except ValueError:
                pass

    # Try to get config from room metadata
    room_metadata = ctx.room.metadata
    if room_metadata:
        try:
            meta = json.loads(room_metadata)
            if meta.get("customer_id"):
                customer_id = meta["customer_id"]
            # Update config with any provided metadata
            for key in config:
                if key in meta and meta[key]:
                    config[key] = meta[key]
            logger.info(f"Loaded config from room metadata: customer_id={customer_id}")
        except json.JSONDecodeError:
            logger.warning("Failed to parse room metadata as JSON")

    # Check SIP participant metadata for caller info
    for participant in ctx.room.remote_participants.values():
        attrs = participant.attributes or {}
        if attrs.get("sip.trunkPhoneNumber"):
            logger.info(f"SIP caller detected: trunk={attrs.get('sip.trunkPhoneNumber')}, from={attrs.get('sip.callID', 'unknown')}")

    # Try to fetch full config from the RoofReporterAI API
    api_url = os.environ.get("ROOFPORTER_API_URL", "https://www.roofreporterai.com")
    if customer_id and api_url:
        try:
            async with aiohttp.ClientSession() as session:
                # Use the internal config endpoint (by customer_id)
                url = f"{api_url}/api/secretary/agent-config/{customer_id}"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        api_config = await resp.json()
                        if api_config.get("success"):
                            data = api_config.get("config", {})
                            for key in ["greeting_script", "common_qa", "general_notes", 
                                       "directories", "agent_name", "agent_voice", 
                                       "business_phone", "customer_id"]:
                                if key in data and data[key]:
                                    config[key] = data[key]
                            logger.info(f"Loaded config from API for customer {customer_id}")
                    else:
                        logger.warning(f"API config fetch failed: status={resp.status}")
        except Exception as e:
            logger.warning(f"Failed to fetch config from API: {e}")

    if customer_id:
        config["customer_id"] = customer_id

    logger.info(f"Final config: customer_id={config.get('customer_id')}, "
                f"agent_name={config.get('agent_name')}, "
                f"greeting_length={len(config.get('greeting_script', ''))}")
    return config


def build_system_prompt(config: dict) -> str:
    """Build the agent's system prompt from the customer's configuration."""
    agent_name = config.get("agent_name", "Sarah")
    greeting = config.get("greeting_script", "Thank you for calling! How can I help you today?")
    qa = config.get("common_qa", "")
    notes = config.get("general_notes", "")
    directories = config.get("directories", [])

    dir_text = ""
    if directories:
        dir_lines = []
        for d in directories:
            name = d.get("name", "Unknown")
            action = d.get("phone_or_action", "take a message")
            notes_d = d.get("special_notes", "")
            line = f"  - {name}: Action = {action}"
            if notes_d:
                line += f" (Notes: {notes_d})"
            dir_lines.append(line)
        dir_text = "\n".join(dir_lines)

    prompt = f"""You are {agent_name}, a professional AI phone receptionist for Rick's Roofing. 
You are answering an inbound phone call. Be warm, friendly, professional, and helpful.
Speak naturally like a real receptionist — use conversational language, not robotic responses.
Keep responses concise since this is a phone call. Avoid long monologues.

CRITICAL RULES:
- You are on a LIVE PHONE CALL. Keep responses brief and conversational.
- Greet the caller warmly when you first answer.
- Listen carefully to what the caller says before responding.
- If you don't understand, politely ask them to repeat.
- ALWAYS collect: 1) Full name, 2) Phone number, 3) Full property address, 4) Service type needed.
- If you can answer from the Q&A below, do so confidently.
- If the caller wants to reach a specific department, offer to take a message for that department.
- NEVER reveal you are an AI unless directly asked. If asked, say "I'm an AI assistant helping answer calls for Rick's Roofing."
- NEVER give exact pricing - always say the estimator will provide that after reviewing the property.
- Be empathetic, especially with emergency situations (leaks, storm damage).
- Use filler phrases like "Let me note that down..." or "One moment..." to sound natural.

YOUR GREETING (say this when you first answer the call):
"{greeting}"

COMMON Q&A (use these to answer frequently asked questions):
{qa if qa else "Answer general roofing questions professionally. Defer pricing to the estimator."}

BUSINESS NOTES & GUIDELINES:
{notes if notes else "No additional notes."}

AVAILABLE DEPARTMENTS:
{dir_text if dir_text else "Sales, Service, Parts — take a message for any department."}
"""
    return prompt


# ============================================================
# The Voice Agent — handles inbound calls
# ============================================================
class RooferSecretaryAgent(Agent):
    """AI receptionist that answers calls for roofing businesses."""

    def __init__(self, config: dict) -> None:
        self._config = config
        self._caller_name = ""
        self._caller_phone = ""
        self._call_summary = ""
        self._directory_routed = ""
        self._messages_taken = []

        super().__init__(
            instructions=build_system_prompt(config)
        )

    async def on_enter(self):
        """Called when the agent enters the session — greet the caller."""
        greeting = self._config.get("greeting_script", "Thank you for calling Rick's Roofing! How can I help you today?")
        self.session.generate_reply(
            instructions=f"You just answered the phone. Greet the caller naturally with this greeting: \"{greeting}\""
        )

    @function_tool
    async def take_message(self, caller_name: str, caller_phone: str, message: str, urgency: str = "normal"):
        """Take a message from the caller. Use this when:
        - The caller wants to leave a message for someone
        - No one is available to help right now
        - The caller requests a callback

        Args:
            caller_name: The caller's full name
            caller_phone: The caller's phone number or callback number
            message: The message they want to leave (include what service they need)
            urgency: How urgent - normal, urgent, or emergency
        """
        self._caller_name = caller_name
        self._caller_phone = caller_phone
        self._messages_taken.append({
            "name": caller_name,
            "phone": caller_phone,
            "message": message,
            "urgency": urgency,
        })

        # Try to post the message to the API
        api_url = os.environ.get("ROOFPORTER_API_URL", "https://www.roofreporterai.com")
        customer_id = self._config.get("customer_id")
        if api_url and customer_id:
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    await session.post(
                        f"{api_url}/api/secretary/webhook/message",
                        json={
                            "customer_id": customer_id,
                            "caller_name": caller_name,
                            "caller_phone": caller_phone,
                            "message": message,
                            "urgency": urgency,
                        },
                        timeout=aiohttp.ClientTimeout(total=5)
                    )
            except Exception as e:
                logger.warning(f"Failed to post message to API: {e}")

        return (
            f"I've taken down your message. To confirm: {caller_name} at {caller_phone}. "
            f"Message: '{message}', marked as {urgency}. "
            f"Someone from the team will get back to you as soon as possible. "
            f"Is there anything else I can help with?"
        )

    @function_tool
    async def schedule_estimate(self, caller_name: str, caller_phone: str, property_address: str, service_type: str):
        """Schedule a roof estimate or inspection. Use this when the caller wants someone to come look at their roof.

        Args:
            caller_name: The caller's full name
            caller_phone: The caller's callback number
            property_address: The FULL property address (street, city, postal code)
            service_type: Type of service - replacement, repair, inspection, emergency, storm damage
        """
        self._caller_name = caller_name
        self._caller_phone = caller_phone

        # Post to API
        api_url = os.environ.get("ROOFPORTER_API_URL", "https://www.roofreporterai.com")
        customer_id = self._config.get("customer_id")
        if api_url and customer_id:
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    await session.post(
                        f"{api_url}/api/secretary/webhook/appointment",
                        json={
                            "customer_id": customer_id,
                            "caller_name": caller_name,
                            "caller_phone": caller_phone,
                            "property_address": property_address,
                            "service_type": service_type,
                            "notes": f"AI-captured lead: {service_type} at {property_address}",
                        },
                        timeout=aiohttp.ClientTimeout(total=5)
                    )
            except Exception as e:
                logger.warning(f"Failed to post appointment to API: {e}")

        return (
            f"Perfect. I've got your information logged. {caller_name} at {caller_phone}, "
            f"for a {service_type} at {property_address}. "
            f"Our estimation team is going to pull some preliminary satellite data on that address, "
            f"and an estimator will call you back shortly to confirm a time to come by. "
            f"Is there anything else I can help with?"
        )

    @function_tool
    async def get_business_hours(self):
        """Get the business hours. Use when caller asks about hours of operation."""
        return (
            "Our office hours are typically Monday through Friday, 8 AM to 5 PM. "
            "For emergency services like active leaks or storm damage, we do have "
            "after-hours emergency dispatch available. Would you like to report an emergency, "
            "or would you prefer to schedule something during regular hours?"
        )

    @function_tool
    async def handle_emergency(self, caller_name: str, caller_phone: str, property_address: str, emergency_details: str):
        """Handle an emergency roofing situation (active leak, storm damage, etc.)

        Args:
            caller_name: The caller's full name
            caller_phone: The caller's phone number
            property_address: The property address
            emergency_details: Description of the emergency
        """
        self._caller_name = caller_name
        self._caller_phone = caller_phone

        # Post urgent message
        api_url = os.environ.get("ROOFPORTER_API_URL", "https://www.roofreporterai.com")
        customer_id = self._config.get("customer_id")
        if api_url and customer_id:
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    await session.post(
                        f"{api_url}/api/secretary/webhook/message",
                        json={
                            "customer_id": customer_id,
                            "caller_name": caller_name,
                            "caller_phone": caller_phone,
                            "message": f"EMERGENCY: {emergency_details} at {property_address}",
                            "urgency": "emergency",
                        },
                        timeout=aiohttp.ClientTimeout(total=5)
                    )
            except Exception as e:
                logger.warning(f"Failed to post emergency to API: {e}")

        return (
            f"I understand this is urgent, {caller_name}. I've flagged this as an emergency. "
            f"For active leaks, we offer emergency dispatch and tarping services. "
            f"We can usually get a crew out within a few hours. "
            f"There is an upfront dispatch fee for emergency response. "
            f"I've logged your information: {caller_phone} at {property_address}. "
            f"Our emergency team will be reaching out to you shortly. "
            f"Is there anything else I should note about the situation?"
        )


# ============================================================
# Agent Server — lifecycle management
# ============================================================
server = AgentServer()


def prewarm(proc: JobProcess):
    """Preload VAD model once per process for faster connections."""
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def entrypoint(ctx: JobContext):
    """Main entrypoint — called for each inbound call."""
    ctx.log_context_fields = {"room": ctx.room.name}

    # Load customer configuration
    config = await get_agent_config(ctx)

    logger.info(
        f"Starting secretary session: room={ctx.room.name}, "
        f"customer_id={config.get('customer_id')}, "
        f"agent_name={config.get('agent_name')}"
    )

    # Create the voice pipeline session using LiveKit Inference
    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3-general"),
        llm=inference.LLM(model="openai/gpt-4.1-mini"),
        tts=inference.TTS(
            model="cartesia/sonic-3",
            # Professional female voice — "Confident Sarah" from Cartesia
            voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        ),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    # Create the agent with the loaded config
    agent = RooferSecretaryAgent(config)

    # Start the session — agent will greet the caller via on_enter()
    await session.start(agent=agent, room=ctx.room)
    await ctx.connect()

    logger.info(f"Agent connected to room {ctx.room.name}")

    # Log call completion when the session ends
    @ctx.room.on("participant_disconnected")
    def on_participant_left(participant):
        if participant.identity.startswith("sip-"):
            logger.info(f"Call ended: participant {participant.identity} left room {ctx.room.name}")
            # Post call completion to the API
            api_url = os.environ.get("ROOFPORTER_API_URL", "https://www.roofreporterai.com")
            customer_id = config.get("customer_id")
            if api_url and customer_id:
                try:
                    import requests
                    requests.post(
                        f"{api_url}/api/secretary/webhook/call-complete",
                        json={
                            "customer_id": customer_id,
                            "room_name": ctx.room.name,
                            "caller_identity": participant.identity,
                            "messages_taken": agent._messages_taken,
                            "caller_name": agent._caller_name,
                            "caller_phone": agent._caller_phone,
                        },
                        timeout=5
                    )
                except Exception as e:
                    logger.warning(f"Failed to post call completion: {e}")


if __name__ == "__main__":
    cli.run_app(server)
