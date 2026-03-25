import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { credential } from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting SocialTrackr Server...");
dotenv.config();

// Initialize Firebase Admin
if (process.env.VITE_FIREBASE_PROJECT_ID) {
  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: credential.applicationDefault(),
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      });
      console.log("Firebase Admin initialized.");
    }
  } catch (e) {
    console.warn("Firebase Admin initialization failed. applicationDefault() might not be available. Falling back to project ID only.");
    if (getApps().length === 0) {
      initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      });
    }
  }
} else {
  console.warn("VITE_FIREBASE_PROJECT_ID missing. Firebase Admin not initialized.");
}

const db = getApps().length ? getFirestore() : null;

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
    res.json({ status: "ok", timestamp: new Date().toISOString(), firebase: !!db });
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

    // Return immediately to prevent timeouts, process in background
    res.status(202).json({ success: true, message: "Milestone processing started" });

    // Background processing
    (async () => {
      try {
        console.log(`Background: Attempting to send email to ${email} for ${streak}-day streak...`);
        
        // 1. Log to Firestore if available
        let userData: any = null;
        if (db) {
          try {
            // Get user by email
            const profilesRef = db.collection('profiles');
            const snapshot = await profilesRef.where('data.email', '==', email).limit(1).get();
            
            if (!snapshot.empty) {
              const doc = snapshot.docs[0];
              userData = { id: doc.id, data: doc.data().data };
            }

            await db.collection('milestones').add({
              user_id: userData?.id || null,
              email,
              streak,
              metadata: { name, timestamp: new Date().toISOString() }
            });

            console.log("Background: Milestone logged to Firestore successfully.");
          } catch (dbErr) {
            console.error("Background: Failed to log milestone to Firestore:", dbErr);
          }
        }

        const client = getResend();
        if (!client) {
          console.error("Background: Email service not configured.");
          return;
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
          console.error("Background: Resend API Error details:", error);
          return;
        }

        console.log(`Background: Email sent successfully to ${email}.`);

        // Free Automation Integration (Make.com, Pipedream, Discord, etc.)
        let automationUrl = process.env.AUTOMATION_WEBHOOK_URL;
        
        // Check if we have a user-specific webhook from Firestore
        if (userData?.data?.webhook_url) {
          automationUrl = userData.data.webhook_url;
          console.log("Background: Using user-specific webhook URL from Firestore profile.");
        }

        if (automationUrl) {
          console.log("Background: Triggering automation webhook...");
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
            console.log("Background: Automation webhook triggered successfully.");
          } catch (zErr) {
            console.error("Background: Failed to trigger automation:", zErr);
          }
        }
      } catch (bgErr) {
        console.error("Background: Error processing milestone:", bgErr);
      }
    })();
  });
  
  // Test Email Route
  app.post("/api/test-email", async (req, res) => {
    const { email, name } = req.body;
    const client = getResend();
    
    if (!client) {
      return res.status(500).json({ 
        success: false, 
        error: "Email service not configured. Please set a valid RESEND_API_KEY." 
      });
    }
    
    try {
      await client.emails.send({
        from: "SocialTrackr <onboarding@resend.dev>",
        to: [email],
        subject: "🚀 SocialTrackr: Test Email Successful!",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #0F172A; max-width: 600px; margin: auto; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 40px;">✅</span>
            </div>
            <h1 style="color: #6C5CE7; margin-top: 0; text-align: center;">It Works!</h1>
            <p style="font-size: 16px; line-height: 1.6; text-align: center; color: #334155;">
              Hi <strong>${name}</strong>, your 3-day milestone emails are configured correctly.
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #64748B; text-align: center;">
              You will receive motivational emails every 3 days of your streak to keep you building and growing.
            </p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.APP_URL || '#'}" style="background: #6C5CE7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Back to Dashboard</a>
            </div>
          </div>
        `
      });
      res.json({ success: true });
    } catch (e) {
      console.error("Test email failed:", e);
      res.status(500).json({ success: false, error: String(e) });
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
    console.log(`🚀 SocialTrackr Server is now listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Firebase Project: ${process.env.VITE_FIREBASE_PROJECT_ID || 'Not set'}`);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  });
}

startServer();
