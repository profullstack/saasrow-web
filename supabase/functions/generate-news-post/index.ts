import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { askC0mpute, c0mputeEnabled, jsonText } from "../_shared/c0mpute.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const adminEmail = Deno.env.get('ADMIN_EMAIL')!;

    console.log('Received request, parsing body...');
    const { topic, tone = 'casual', email } = await req.json();

    if (!email || email !== adminEmail) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
    console.log('Topic received:', topic);

    if (!topic || typeof topic !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    console.log('OpenAI key present:', !!openAIKey);

    if (!openAIKey && !c0mputeEnabled()) {
      return new Response(
        JSON.stringify({ error: 'No AI provider configured (c0mpute disabled and no OPENAI_API_KEY)' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Generating content for topic:', topic, 'tone:', tone);

    const toneInstructions = {
      casual: `Write like you're explaining something to a colleague over coffee. Use contractions (it's, you're, don't), natural phrasing, and an approachable tone. Include occasional informal expressions where appropriate.`,
      professional: `Write in a polished, balanced style suitable for a business audience. Professional but not stuffy. Clear, direct, and authoritative without being dry or academic.`,
      technical: `Write for a technically-savvy audience. Include detailed explanations, specific technical concepts, and assume the reader has domain knowledge. Be precise and thorough without oversimplifying.`
    };

    const prompt = `Write a blog post about: ${topic}

TONE: ${toneInstructions[tone as keyof typeof toneInstructions]}

CRITICAL RULES (NEVER BREAK THESE):
- NEVER use em dashes (—) or en dashes (–). Use hyphens (-) or commas instead
- NEVER use emojis anywhere in the content
- No special unicode characters or fancy punctuation

STYLE GUIDELINES:
- Vary sentence length - mix short punchy sentences with longer flowing ones
- Start some sentences with "And" or "But" if it flows naturally
- Don't be afraid to use sentence fragments for emphasis
- Write naturally, not robotically

AVOID THESE AI TELLS:
- No "in this article, we'll explore..." or "in conclusion" phrases
- Skip robotic transitions like "firstly, secondly, finally"
- Don't start paragraphs with "It's important to note that..."
- Avoid overused words: "delve into", "realm", "landscape", "revolutionize", "game-changer", "robust", "seamless"
- No bullet points that all follow identical grammatical structure
- Skip overly balanced "on one hand... on the other hand" constructions
- No "the bottom line is..." or similar summary phrases

CONTENT STRUCTURE:
- Start with a hook or interesting observation, not a formal introduction
- 3-5 sections with natural headings (not "Introduction" or "Conclusion")
- Mix explanations with examples and specific details
- End with something thought-provoking or actionable, not a summary recap
- Total length: 500-700 words

Return a JSON object with:
- title: A compelling, natural-sounding title (40-70 characters) - no colons or "The Ultimate Guide" style
- excerpt: A hook that makes people want to read more (120-160 characters)
- content: Full HTML with <h2>, <p>, <ul>, <li> tags. Write like a human, not a content template.`;

    const SYSTEM = 'You are an experienced tech blogger with a casual, authentic writing voice. Write like a real person sharing genuine insights, not like an AI following a template. Your writing should have personality and feel conversational. Always respond with valid JSON only.';

    // c0mpute first, then OpenAI as the paid fallback.
    let generatedContent: { title?: string; excerpt?: string; content?: string } | null = null;
    if (c0mputeEnabled()) {
      try {
        console.log('Calling c0mpute...');
        const parsed = JSON.parse(jsonText(await askC0mpute({
          system: SYSTEM,
          user: prompt,
          temperature: 0.9,
          maxTokens: 1500,
          feature: 'saasrow.generate-news-post',
        })));
        if (typeof parsed?.title === 'string' && typeof parsed?.content === 'string') generatedContent = parsed;
        else console.error('c0mpute answer is missing title or content');
      } catch (err) {
        console.error('c0mpute failed:', err instanceof Error ? err.message : String(err));
      }
    }

    if (!generatedContent && openAIKey) {
      console.log('Calling OpenAI API...');
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
          temperature: 0.9,
          response_format: { type: 'json_object' }
        }),
      });

      console.log('OpenAI response status:', openAIResponse.status);
      if (openAIResponse.ok) {
        const openAIData = await openAIResponse.json();
        generatedContent = JSON.parse(openAIData.choices[0].message.content);
      } else {
        const errorText = await openAIResponse.text();
        console.error('OpenAI API error:', openAIResponse.status, errorText);
      }
    }

    if (!generatedContent?.title) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate content' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Generated content:', generatedContent.title);

    const slug = generatedContent.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);

    console.log('Saving to database...');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: newsPost, error: dbError } = await supabase
      .from('news_posts')
      .insert({
        slug: slug + '-' + Date.now(),
        title: generatedContent.title,
        excerpt: generatedContent.excerpt,
        content: generatedContent.content,
        published: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError, dbError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to save post' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Success! Returning news post:', newsPost.id);
    return new Response(
      JSON.stringify(newsPost),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error, error instanceof Error ? error.stack : '');
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
