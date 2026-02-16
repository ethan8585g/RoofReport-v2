
import { Hono } from 'hono'
import { Bindings } from '../types'

export const edgeDataRoutes = new Hono<{ Bindings: Bindings }>()

// Helper to handle CORS (Hono handles this globally, but user requested specific headers)
// We will rely on Hono's global CORS or add specific if needed.

// --- ENDPOINT 1: Get Roofing Pricing ---
edgeDataRoutes.get('/pricing', async (c) => {
    try {
        // 1. Fetch data from KV (Instant Read)
        // Note: Bindings must be updated to include ANTIGRAVITY_DATA in src/types.ts and wrangler.jsonc
        const pricingData = await c.env.ANTIGRAVITY_DATA.get("pricing_config", { type: "json" });

        // 2. Fallback if data is missing
        if (!pricingData) {
            return c.json({ error: "Pricing config not found", source: "kv_fallback" }, 404);
        }

        // 3. Return the data
        return c.json(pricingData);
    } catch (e) {
        return c.json({ error: "Failed to fetch pricing config", details: String(e) }, 500);
    }
})

// --- ENDPOINT 2: Get AI System Prompt ---
edgeDataRoutes.get('/prompt', async (c) => {
    try {
        const promptText = await c.env.ANTIGRAVITY_DATA.get("ai_system_prompt", { type: "text" });

        return c.json({
            prompt: promptText || "You are a helpful roofing assistant.",
            source: promptText ? "kv" : "default"
        });
    } catch (e) {
        return c.json({ error: "Failed to fetch prompt", details: String(e) }, 500);
    }
})
