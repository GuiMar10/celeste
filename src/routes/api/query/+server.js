import { API_KEY } from '$env/static/private';
import { json } from "@sveltejs/kit";

export async function POST({ request, setHeaders }) {
    if (!API_KEY) {
        return json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Read client body (should contain model, messages, etc.)
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.model || !body.messages) {
        return json({ error: 'Missing model or messages' }, { status: 400 });
    }

    // Forward request to OpenRouter with server-side key
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
    });

    // If upstream returned non-stream error, parse and return JSON
    if (!upstream.ok) {
        const text = await upstream.text();
        // keep upstream message (be careful not to leak keys — upstream response is safe)
        return new Response(text, {
            status: upstream.status,
            headers: {
                "Content-Type": upstream.headers.get("Content-Type") || "application/json"
            }
        });
    }

    // Stream the upstream response body directly back to the client.
    // Keep content-type (likely text/event-stream or application/json depending on stream setting).
    const contentType = upstream.headers.get("content-type") || "text/event-stream";

    // Pass-through selected headers. Do not forward all headers blindly.
    const headers = {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
    };

    return new Response(upstream.body, {
        status: upstream.status,
        headers
    });
}