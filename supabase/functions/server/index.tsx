import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-96237c51/health", (c) => {
  return c.json({ status: "ok" });
});

// Create new form
app.post("/make-server-96237c51/forms", async (c) => {
  try {
    const body = await c.req.json();
    const { title, questions } = body;

    if (!title || !questions || !Array.isArray(questions)) {
      return c.json({ error: "Invalid form data" }, 400);
    }

    const formId = crypto.randomUUID();
    const form = {
      id: formId,
      title,
      questions,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`form:${formId}`, form);
    console.log(`Form created successfully: ${formId}`);

    return c.json({ formId, form });
  } catch (error) {
    console.log(`Error creating form: ${error}`);
    return c.json({ error: "Failed to create form" }, 500);
  }
});

// Get form by ID
app.get("/make-server-96237c51/forms/:formId", async (c) => {
  try {
    const formId = c.req.param("formId");
    const form = await kv.get(`form:${formId}`);

    if (!form) {
      return c.json({ error: "Form not found" }, 404);
    }

    return c.json({ form });
  } catch (error) {
    console.log(`Error fetching form: ${error}`);
    return c.json({ error: "Failed to fetch form" }, 500);
  }
});

// Delete form and all responses tied to it
app.delete("/make-server-96237c51/forms/:formId", async (c) => {
  try {
    const formId = c.req.param("formId");
    const form = await kv.get(`form:${formId}`);

    if (!form) {
      return c.json({ error: "Form not found" }, 404);
    }

    const responseEntries = await kv.getEntriesByPrefix(`response:${formId}:`);

    await kv.del(`form:${formId}`);

    if (responseEntries.length > 0) {
      await kv.mdel(responseEntries.map((entry) => entry.key));
    }

    console.log(`Form deleted successfully: ${formId}`);
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting form: ${error}`);
    return c.json({ error: "Failed to delete form" }, 500);
  }
});

// Submit form response
app.post("/make-server-96237c51/forms/:formId/responses", async (c) => {
  try {
    const formId = c.req.param("formId");
    const body = await c.req.json();
    const { answers, respondentName } = body;

    if (!answers) {
      return c.json({ error: "Invalid response data" }, 400);
    }

    const responseId = crypto.randomUUID();
    const response = {
      id: responseId,
      formId,
      answers,
      respondentName: respondentName || "Anonymous",
      submittedAt: new Date().toISOString(),
    };

    await kv.set(`response:${formId}:${responseId}`, response);
    console.log(`Response submitted successfully for form ${formId}: ${responseId}`);

    return c.json({ responseId, response });
  } catch (error) {
    console.log(`Error submitting response: ${error}`);
    return c.json({ error: "Failed to submit response" }, 500);
  }
});

// Get all responses for a form
app.get("/make-server-96237c51/forms/:formId/responses", async (c) => {
  try {
    const formId = c.req.param("formId");
    const responses = await kv.getByPrefix(`response:${formId}:`);

    return c.json({ responses });
  } catch (error) {
    console.log(`Error fetching responses: ${error}`);
    return c.json({ error: "Failed to fetch responses" }, 500);
  }
});

// Get all forms
app.get("/make-server-96237c51/forms", async (c) => {
  try {
    const forms = await kv.getByPrefix(`form:`);
    return c.json({ forms });
  } catch (error) {
    console.log(`Error fetching forms: ${error}`);
    return c.json({ error: "Failed to fetch forms" }, 500);
  }
});

Deno.serve(app.fetch);