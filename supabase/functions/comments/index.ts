import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { notifyCommentPublished } from "../_shared/commentNotify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Comment {
  id: string;
  submission_id: string;
  author_name: string;
  author_email: string;
  content: string;
  rating?: number;
  created_at: string;
  updated_at: string;
  is_verified: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const submissionId = url.searchParams.get("submissionId");

      if (!submissionId) {
        return new Response(
          JSON.stringify({ error: "submissionId is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: comments, error } = await supabase
        .from("comments")
        .select("*")
        .eq("submission_id", submissionId)
        .eq("is_verified", true)
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const averageRating = comments.length > 0
        ? comments
            .filter((c) => c.rating !== null)
            .reduce((sum, c) => sum + (c.rating || 0), 0) /
          comments.filter((c) => c.rating !== null).length
        : null;

      return new Response(
        JSON.stringify({
          comments,
          count: comments.length,
          averageRating: averageRating ? parseFloat(averageRating.toFixed(1)) : null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");

      const { data: { user } } = await supabase.auth.getUser(token || "");

      const body = await req.json();
      const { submissionId, authorName, authorEmail, content, rating } = body;

      if (!submissionId || !content) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!user && (!authorName || !authorEmail)) {
        return new Response(
          JSON.stringify({ error: "Name and email required for anonymous comments" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (content.length < 10 || content.length > 2000) {
        return new Response(
          JSON.stringify({ error: "Content must be between 10 and 2000 characters" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (rating && (rating < 1 || rating > 5)) {
        return new Response(
          JSON.stringify({ error: "Rating must be between 1 and 5" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!user) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(authorEmail)) {
          return new Response(
            JSON.stringify({ error: "Invalid email address" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] ||
                       req.headers.get("x-real-ip") ||
                       "unknown";

      if (!user) {
        const { data: recentComments } = await supabase
          .from("comments")
          .select("id")
          .eq("ip_address", clientIp)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

        if (recentComments && recentComments.length >= 3) {
          return new Response(
            JSON.stringify({ error: "Too many comments. Please try again later." }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      let finalAuthorName = authorName;
      let finalAuthorEmail = authorEmail;

      if (user) {
        finalAuthorEmail = user.email!;
        if (authorName && authorName.trim()) {
          finalAuthorName = authorName;
        } else {
          finalAuthorName = user.email!.split('@')[0];
        }
      }

      const isVerified = !!user;

      // Get user_id from users table if authenticated
      let userIdToInsert = null;
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();

        if (userData) {
          userIdToInsert = userData.id;
        }
      }

      const { data: comment, error } = await supabase
        .from("comments")
        .insert({
          submission_id: submissionId,
          author_name: finalAuthorName,
          author_email: finalAuthorEmail,
          content: content,
          rating: rating || null,
          ip_address: clientIp,
          is_verified: isVerified,
          user_id: userIdToInsert,
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // A signed-in comment is public at once; an anonymous one notifies on approval.
      if (comment.is_verified) await notifyCommentPublished(supabase, [comment.id]);

      const message = user
        ? "Comment posted successfully!"
        : "Comment submitted successfully. It will appear after review.";

      return new Response(
        JSON.stringify({
          message,
          comment,
        }),
        {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
