"""
RoofReporterAI — Interactive Report Homeowner Guide
LiveKit Web Voice Agent

Embeds on the shared report page. When a homeowner clicks "Ask AI about this roof",
a LiveKit web voice session starts. The agent is fed the full report data (segments,
edges, materials, pitch, waste factor) and explains the technical information in
simple, homeowner-friendly language.

Acts as a 24/7 sales closer for B2B contractors.
"""

import os
import json
import logging
import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent, AgentServer, AgentSession, JobContext, JobProcess,
    cli, inference, function_tool, RunContext, room_io,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv(".env.local")
logger = logging.getLogger("report-guide")

API_BASE = os.environ.get("ROOFPORTER_API_URL", "https://roofreporterai.com")


async def fetch_report_data(order_id: str) -> dict | None:
    url = f"{API_BASE}/api/agents/report-data/{order_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch report data: {e}")
    return None


def build_report_prompt(data: dict) -> str:
    segments = data.get("segments", [])
    materials = data.get("materials", {})
    edges = data.get("edges", {})

    seg_text = ""
    if segments:
        for i, s in enumerate(segments):
            seg_text += f"  Facet {i+1}: {s.get('area_sqft', '?')} sqft, pitch {s.get('pitch', '?')}:12\n"

    mat_text = ""
    if materials:
        for k, v in materials.items():
            mat_text += f"  {k}: {v}\n"

    return f"""You are a friendly, knowledgeable roofing expert assistant embedded on a roof measurement report page.
A homeowner is viewing their roof measurement report and has questions. Explain technical details in simple,
easy-to-understand language. Be reassuring and professional.

You are on a VOICE CALL via their browser. Keep responses concise and conversational.

REPORT DATA FOR THIS PROPERTY:
Address: {data.get('address', 'Unknown')}
Total Roof Area: {data.get('roof_area_sqft', 'N/A')} square feet
Gross Squares: {data.get('gross_squares', 'N/A')}
Waste Factor: {data.get('waste_factor_pct', 'N/A')}%
Bundle Count: {data.get('bundle_count', 'N/A')} bundles
Roof Pitch: {data.get('pitch', 'N/A')}

ROOF SEGMENTS (FACETS):
{seg_text if seg_text else '  No segment data available'}

EDGE MEASUREMENTS:
  Total Ridge: {edges.get('total_ridge_ft', 'N/A')} ft
  Total Hip: {edges.get('total_hip_ft', 'N/A')} ft
  Total Valley: {edges.get('total_valley_ft', 'N/A')} ft
  Total Eave: {edges.get('total_eave_ft', 'N/A')} ft

MATERIAL ESTIMATE:
{mat_text if mat_text else '  No material breakdown available'}

REPORT SUMMARY:
{data.get('summary', 'Professional roof measurement report.')}

GUIDELINES:
- Explain waste factor simply: more complex roofs (valleys, hips) need more material for cuts/overlaps
- Explain pitch: steeper roofs are harder to work on and affect material selection
- Explain squares: 1 square = 100 sqft of roofing, industry standard
- If asked about price, say the report provides measurements and the contractor will provide specific pricing
- Encourage them to contact their contractor if they have questions about the quote
- Be warm and helpful — you are building trust for the roofing contractor
"""


class ReportGuideAgent(Agent):
    def __init__(self, report_data: dict) -> None:
        self._data = report_data
        super().__init__(instructions=build_report_prompt(report_data))

    async def on_enter(self):
        addr = self._data.get("address", "your property")
        self.session.generate_reply(
            instructions=f"Greet the homeowner warmly. Say something like: Hi there! I'm here to help you understand your roof measurement report for {addr}. What questions do you have?"
        )

    @function_tool
    async def explain_waste_factor(self, context: RunContext):
        """Explain the waste factor on this roof in simple terms."""
        wf = self._data.get("waste_factor_pct", "unknown")
        segs = len(self._data.get("segments", []))
        return f"The waste factor for this roof is {wf}%. This means about {wf}% extra material is needed because the roof has {segs} facets. More facets means more cuts around hips and valleys, which creates material waste. This is standard practice to ensure the crew doesn't run short."

    @function_tool
    async def explain_materials(self, context: RunContext):
        """Give a plain-English summary of what materials are needed."""
        m = self._data.get("materials", {})
        if not m:
            return "The material estimate isn't available in detail, but your contractor will have the full breakdown."
        items = [f"{k}: {v}" for k, v in m.items()]
        return "Here's what's needed for your roof: " + ", ".join(items)

    @function_tool
    async def explain_roof_size(self, context: RunContext):
        """Explain the total roof area in relatable terms."""
        area = self._data.get("roof_area_sqft", 0)
        sq = self._data.get("gross_squares", 0)
        return f"Your roof is {area} square feet total, which equals {sq} roofing squares. One square covers 100 square feet. To put it in perspective, that's roughly the size of {round(float(area or 0) / 200, 1)} average living rooms."


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()

server.setup_fnc = prewarm


@server.rtc_session(agent_name="report-guide")
async def entrypoint(ctx: JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    # Extract order_id from room name: report-guide-{orderId}
    order_id = None
    import re
    match = re.match(r"report-guide-(\w+)", ctx.room.name)
    if match:
        order_id = match.group(1)

    # Also check room metadata
    report_data = {}
    if ctx.room.metadata:
        try:
            meta = json.loads(ctx.room.metadata)
            if "order_id" in meta:
                order_id = str(meta["order_id"])
            if "report_data" in meta:
                report_data = meta["report_data"]
        except:
            pass

    # Fetch report data from API if not in metadata
    if order_id and not report_data:
        report_data = await fetch_report_data(order_id) or {}

    if not report_data:
        report_data = {"address": "Unknown", "summary": "Report data not available."}

    logger.info(f"Report guide session: room={ctx.room.name}, order={order_id}")

    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="en"),
        llm=inference.LLM(model="openai/gpt-4.1-mini"),
        tts=inference.TTS(model="cartesia/sonic-3", voice="9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    agent = ReportGuideAgent(report_data)
    await session.start(agent=agent, room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
