import os
import time
import json
import re
import redis
import requests
from datetime import datetime, timezone
from google_auth_oauthlib.flow import InstalledAppFlow
import webbrowser
import sys
from pathlib import Path
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# === NEW: Gemini ===
import google.generativeai as genai
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "models/gemini-1.5-flash"
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel(GEMINI_MODEL)


GREET_REGEX = re.compile(
    r"\b(hi|hello|hey|yo|namaste|wass?up|whats?up|hola|bonjour)\b",
    re.IGNORECASE
)

def parse_iso8601_utc(ts: str):
    # YouTube returns ISO8601 with 'Z' for UTC
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))

def _register_browser_with_profile(browser, profile):
    """
    Register a specific browser + profile name with Python's webbrowser module
    and make it the default for this process via BROWSER env var.
    """
    if browser == "chrome":
        if sys.platform.startswith("win"):
            exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            if not Path(exe).exists():
                exe = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
            cmd = f'"{exe}" --profile-directory="{profile}" %s'
        elif sys.platform == "darwin":
            exe = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            cmd = f'"{exe}" --profile-directory="{profile}" %s'
        else:  # Linux
            exe = "google-chrome"
            cmd = f'{exe} --profile-directory="{profile}" %s'
    else:
        raise ValueError("Only 'chrome' shown here; add 'edge'/'firefox' if needed.")

    webbrowser.register("oauth-browser", None, webbrowser.BackgroundBrowser(cmd))
    os.environ["BROWSER"] = "oauth-browser"

# --- Settings (update these to your actual file paths) ---
MAIN_CLIENT_SECRET = "D:/my_data/client_secret_676814211851-fo61rbqq4h6hmq4r6u44um70tbndqoj4.apps.googleusercontent.com.json"   # <-- Main channel's client_secret file
BOT_CLIENT_SECRET  = "D:/my_data/MSbot.json"    # <-- Bot channel's client_secret file
MAIN_TOKEN_FILE    = "D:/my_data/main_token.json"
BOT_TOKEN_FILE     = "D:/my_data/bot_token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"]

QUEUE_FILE = "queue.txt"
BANNED_WORDS = ["fuck", "bitch", "nude", "xxx", "chutiya", "bhenchod", "mc", "bc"]

# --- Redis (no changes) ---
redis_client = redis.StrictRedis(host="localhost", port=6379, db=0, decode_responses=True)

# --- GROQ API (no changes) ---
GROQ_API_KEY = "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"

def generate_reply(prompt: str) -> str:
    try:
        response = gemini_model.generate_content([
            {"role": "system", "content": "You are a funny, bold chatbot replying in Hinglish for Mohit Shukla's livestream."},
            {"role": "user", "content": prompt}
        ])
        
        # Extract the text safely
        if response and response.candidates:
            return response.candidates[0].content.parts[0].text.strip()
        else:
            return "Arre bhai, Gemini ne aaj chhutti le li 😂"
    except Exception as e:
        print(f"❌ Gemini API error: {e}")
        return "...Gemini thoda so gaya lagta hai 😅"

# --- TOKEN HANDLING: New, Safe Persistent Google OAuth Logic ---
def get_youtube_credentials(token_file, client_secret_file, scopes, port):
    _register_browser_with_profile(browser="chrome", profile="MohitS")
    creds = None
    if os.path.exists(token_file):
        print("Trueeeeeeeeee")
        creds = Credentials.from_authorized_user_file(token_file, scopes)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                print(creds.to_json())
                print(creds)
            except Exception as e:
                print(f"Token refresh failed for {token_file}: {e}")
                creds = None
        if not creds or not creds.valid:
            flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, scopes)
            creds = flow.run_local_server(port=port)
            creds.refresh(Request())
            print(creds.to_json())
            print(creds)
        with open(token_file, 'w') as token:
            token.write(creds.to_json())
    return creds

# --- Refresh creds at runtime if needed (no changes) ---
def refresh_creds_if_needed(youtube, token_path):
    creds = youtube._http.credentials
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            with open(token_path, "w") as f:
                f.write(creds.to_json())
        except Exception as e:
            print(f"⚠️ Failed to refresh token at runtime: {e}")

# --- Get Live Chat ID (no changes) ---
def get_live_chat_id(youtube):
    broadcasts = youtube.liveBroadcasts().list(part="snippet,status", broadcastType="all", mine=True).execute()
    for b in broadcasts.get("items", []):
        if b["status"].get("lifeCycleStatus") == "live":
            return b["snippet"].get("liveChatId")
    return None

# --- Queue System (no changes) ---
chat_queue = []
def update_queue_file():
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(chat_queue))

# --- Main chat loop, now ONLY replies as per your requirement ---
def chat_loop(main_youtube, bot_youtube, live_chat_id):
    replied_message_ids = set()
    last_checked = datetime.now(timezone.utc)
    next_page_token = ""
    
    while True:
        try:
            refresh_creds_if_needed(main_youtube, MAIN_TOKEN_FILE)
            refresh_creds_if_needed(bot_youtube, BOT_TOKEN_FILE)

            response = main_youtube.liveChatMessages().list(
                liveChatId=live_chat_id,
                part="snippet,authorDetails",
                pageToken=next_page_token
            ).execute()
            for item in response.get("items", []):
                msg_id = item['id']
                published_time = item['snippet'].get("publishedAt")
                published_dt = parse_iso8601_utc(published_time)
                user = item['authorDetails']['displayName']
                text = item['snippet']['displayMessage']

                if (
                    msg_id not in replied_message_ids
                    and published_dt > last_checked
                    and user != "MS Edutainment Bot"
                ):
                    lower_text = text.strip().lower()
                    is_greeting = bool(GREET_REGEX.search(lower_text))
                    is_bot_mention = ("!bot" in lower_text) or ("!ai" in lower_text)

                    # --- ONLY reply if: greeting, new user, or !bot/!ai command ---

                    redis_key = f"user:{item['authorDetails']['channelId']}:messages"
                    is_new_user = redis_client.llen(redis_key) == 0
                    is_bot_mention = "!bot" in lower_text or "!ai" in lower_text
                    print("greet>",is_greeting)
                    print("newwwww>", is_new_user)
                    print("!bot>>>>>", is_bot_mention)
                    print("sdfsdfsdfds>", item['authorDetails']['channelId'])
                    if response.get("items"):
                        last_checked = max(parse_iso8601_utc(m["snippet"]["publishedAt"])
                       for m in response["items"])
                    if is_greeting or is_bot_mention:
                        redis_client.rpush(redis_key, text)
                        redis_client.ltrim(redis_key, -10, -1)
                        context_lines = redis_client.lrange(redis_key, 0, -1)
                        context_text = "".join(context_lines)
                        prompt = f"""
                
You are the livestream chatbot of Mohit Shukla — a bold, savage Hinglish creator.

🎭 His content includes:
- Hinglish comedy, rants, chess, PS5 games, and funny reels
- Roasting and replying in funny, real desi style — no filter, but no gaali

Your job is to reply to live chat messages in 1 short Hinglish line.

🧠 You remember users from Redis history and can refer to their past messages.

Respond based on the type of message:

---

👋 If it’s a GREETING ("hi", "yo", "hello", "wassup", etc):
- Reply with a fun Hinglish welcome
- If they’re returning, say “welcome back” and recall something funny they said before

🧠 If they ask who you are:
- Say you’re Mohit’s livestream bot
- Plug his Insta and latest YouTube Short
- Make it sound chill and swaggy

🔗 If they say “Insta”, “YT”, “reel”, etc:
- Share links and say something cool

😂 If they roast or insult:
- Reply with a smart, cheeky Hinglish comeback (no abuse, no gaali)

❓ If they ask questions:
- Answer helpfully in Hinglish with a slight roasty/funny tone

---

⚠️ RULES:
- NEVER say “I’m an AI”
- NEVER apologize
- NEVER write paragraphs
- NEVER be robotic
- NO gaali, no adult jokes
- ✅ Always sound like a desi streamer with swag
- ✅ Use emojis if they fit naturally
- ✅ Be human — not formal, not boring

---

Now reply like Mohit would, in **one savage/funny/real Hinglish line**.


### User:
@{user}

### Past Chat:
{context_text}

### New Message:
"{text}"
"""
                        try:
                            reply = generate_reply(prompt)
                        except Exception as e:
                            print(f"❌ Error generating reply: {e}")
                            reply = "...kuch toh gadbad hai bhai 😅"
                        try:
                            bot_youtube.liveChatMessages().insert(
                                part="snippet",
                                body={
                                    "snippet": {
                                        "liveChatId": live_chat_id,
                                        "type": "textMessageEvent",
                                        "textMessageDetails": {"messageText": f"@{user} {reply}"}
                                    }
                                }
                            ).execute()
                        except Exception as e:
                            print(f"❌ Error posting reply: {e}")
                    replied_message_ids.add(msg_id)

            next_page_token = response.get("nextPageToken")
            last_checked = datetime.now(timezone.utc)
            delay = response.get("pollingIntervalMillis", 5000) / 1000.0
            time.sleep(delay)
        except Exception as e:
            print(f"❌ Chat loop error: {e}")
            time.sleep(5)
        if response.get("items"):
            last_checked = max(
            last_checked,   # your previous checkpoint
            max(            # newest message timestamp in this batch
            parse_iso8601_utc(m["snippet"]["publishedAt"])
            for m in response["items"]
        )
    )

# --- MAIN ---
if __name__ == "__main__":
    print("🔐 Logging in with your MAIN YouTube account...")
    main_creds = get_youtube_credentials(MAIN_TOKEN_FILE, MAIN_CLIENT_SECRET, SCOPES, 8080)
    main_youtube = build("youtube", "v3", credentials=main_creds)

    print("🔐 Logging in with your BOT YouTube account...")
    bot_creds = get_youtube_credentials(BOT_TOKEN_FILE, BOT_CLIENT_SECRET, SCOPES, 8081)
    bot_youtube = build("youtube", "v3", credentials=bot_creds)

    live_chat_id = get_live_chat_id(main_youtube)
    if live_chat_id:
        print("✅ Connected to live chat!")
        chat_loop(main_youtube, bot_youtube, live_chat_id)
    else:
        print("❌ No live chat found.")