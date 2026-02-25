import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting SocialTrackr Server...");
dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize Resend lazily
let resendClient: Resend | null = null;
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "MY_RESEND_API_KEY") return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check for Render
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), supabase: !!supabase });
  });

  app.get("/favicon.ico", (req, res) => {
    res.status(204).end();
  });

  // API Routes
  app.post("/api/milestone", async (req, res) => {
    console.log("Received milestone request:", req.body);
    const { email, name, streak } = req.body;
    const apiKey = process.env.RESEND_API_KEY;

    if (!email || !name || !streak) {
      console.error("Missing required fields in request body");
      return res.status(400).json({ success: false, error: "Missing email, name, or streak" });
    }

    if (!apiKey || apiKey === "MY_RESEND_API_KEY") {
      console.error("RESEND_API_KEY is missing or invalid.");
      return res.status(500).json({ 
        success: false, 
        error: "Email service not configured. Please set a valid RESEND_API_KEY in environment variables." 
      });
    }

    try {
      console.log(`Attempting to send email to ${email} for ${streak}-day streak...`);
      
      // 1. Log to Supabase if available
      if (supabase) {
        try {
          // Get user ID by email to log correctly
          // We use maybeSingle() to avoid throwing if not found
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('id, data')
            .filter('data->>email', 'eq', email)
            .maybeSingle();
          
          if (userError) {
            console.warn("Supabase profile lookup error:", userError.message);
          }

          const { error: insertError } = await supabase.from('milestones').insert({
            user_id: userData?.id || null,
            email,
            streak,
            metadata: { name, timestamp: new Date().toISOString() }
          });

          if (insertError) {
            console.warn("Supabase milestone insert error (table might not exist yet):", insertError.message);
          } else {
            console.log("Milestone logged to Supabase successfully.");
          }
          
          // If user has a custom webhook in their data, use it
          if (userData?.data?.webhook_url) {
            console.log("User has a custom webhook URL in their profile.");
          }
        } catch (dbErr) {
          console.error("Failed to log milestone to Supabase:", dbErr);
        }
      }

      const client = getResend();
      if (!client) {
        throw new Error("Email service not configured. Please set a valid RESEND_API_KEY.");
      }
      
      const motivationalQuotes = [
        "Consistency is what transforms average into excellence.",
        "Success is the sum of small efforts, repeated day in and day out.",
        "Your future self will thank you for the work you're doing today.",
        "The secret of your success is found in your daily routine.",
        "Don't stop when you're tired. Stop when you're done."
      ];
      const quote = motivationalQuotes[streak % motivationalQuotes.length];

      const { data, error } = await client.emails.send({
        from: "SocialTrackr <onboarding@resend.dev>",
        to: [email],
        subject: `🔥 ${streak} Days Done! You're Building Momentum`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #0F172A; max-width: 600px; margin: auto; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 40px;">🚀</span>
            </div>
            <h1 style="color: #6C5CE7; margin-top: 0; text-align: center;">${streak} Days Done, More to Go!</h1>
            <p style="font-size: 18px; line-height: 1.6; text-align: center; color: #334155;">
              Amazing work, <strong>${name}</strong>! You've just hit a ${streak}-day streak.
            </p>
            
            <div style="margin: 30px 0; padding: 24px; background: #F8FAFC; border-radius: 12px; border-left: 4px solid #6C5CE7;">
              <p style="margin: 0; font-style: italic; color: #475569; font-size: 16px;">
                "${quote}"
              </p>
            </div>

            <p style="font-size: 16px; line-height: 1.5; color: #334155;">
              Consistency is the ultimate competitive advantage. While others are waiting for inspiration, you are building a habit.
            </p>
            
            <div style="margin: 30px 0; padding: 20px; background: #EEF2FF; border-radius: 12px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #4338CA; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Next Milestone</p>
              <p style="margin: 0; color: #1E1B4B; font-size: 24px; font-weight: 800;">${streak + 3} Days</p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.APP_URL || '#'}" style="background: #6C5CE7; color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(108, 92, 231, 0.2);">Keep the Streak Alive</a>
            </div>

            <hr style="margin: 40px 0 20px 0; border: 0; border-top: 1px solid #F1F5F9;" />
            <p style="font-size: 12px; color: #94A3B8; text-align: center;">
              SocialTrackr · Your AI Growth OS<br/>
              <a href="${process.env.APP_URL || '#'}" style="color: #6C5CE7; text-decoration: none;">Unsubscribe</a> from milestone alerts
            </p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend API Error details:", error);
        return res.status(400).json({ success: false, error: error.message });
      }

      console.log(`Email sent successfully to ${email}. Response data:`, data);

      // Free Automation Integration (Make.com, Pipedream, Discord, etc.)
      let automationUrl = process.env.AUTOMATION_WEBHOOK_URL;
      
      // Check if we have a user-specific webhook from Supabase
      if (supabase) {
        try {
          const { data: userData } = await supabase
            .from('profiles')
            .select('data')
            .filter('data->>email', 'eq', email)
            .maybeSingle();
            
          if (userData?.data?.webhook_url) {
            automationUrl = userData.data.webhook_url;
            console.log("Using user-specific webhook URL from Supabase profile.");
          }
        } catch (e) {
          console.warn("Failed to fetch user-specific webhook:", e);
        }
      }

      if (automationUrl) {
        console.log("Triggering automation webhook...");
        try {
          const webhookPayload = {
            event: 'milestone_reached',
            email,
            name,
            streak,
            timestamp: new Date().toISOString(),
            quote,
            app_url: process.env.APP_URL
          };

          // Handle Discord specifically if the URL looks like a Discord webhook
          if (automationUrl.includes('discord.com/api/webhooks')) {
            await fetch(automationUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `🔥 **Milestone Reached!**`,
                embeds: [{
                  title: `${name} hit a ${streak}-day streak!`,
                  description: `"${quote}"`,
                  color: 7101671, // Purple
                  fields: [
                    { name: 'User', value: email, inline: true },
                    { name: 'Streak', value: `${streak} Days`, inline: true }
                  ],
                  timestamp: new Date().toISOString()
                }]
              })
            });
          } else {
            // Standard JSON POST for Make.com / Pipedream
            await fetch(automationUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload)
            });
          }
          console.log("Automation webhook triggered successfully.");
        } catch (zErr) {
          console.error("Failed to trigger automation:", zErr);
        }
      }

      return res.json({ success: true, data });
    } catch (err: any) {
      console.error("Server Exception during email send:", err);
      res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });

  // Handle unknown API routes with JSON
  app.all("/api/*", (req, res) => {
    res.status(404).json({ success: false, error: `API route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  });
}

startServer();
