# 🔧 API Documentation

## Suno AI API Endpoints

### Base URL
```
https://studio-api.prod.suno.com
```

### Authentication
Uses Clerk authentication with `__session` cookie.

### Required Headers

```javascript
{
  'Accept': '*/*',
  'Accept-Language': 'uk,en-US;q=0.9,en;q=0.8',
  'Content-Type': 'application/json',
  'Origin': 'https://suno.com',
  'Referer': 'https://suno.com/',
  'browser-token': '{"token":"BASE64_ENCODED_TIMESTAMP"}',
  'device-id': 'UUID_V4',
  'Cookie': '__session=YOUR_SESSION_TOKEN',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site'
}
```

### Browser Token Format

```javascript
// Generate timestamp
const timestamp = Date.now(); // e.g., 1764098869437

// Create JSON object
const tokenObject = { timestamp: timestamp };

// Encode to base64
const base64Token = Buffer.from(JSON.stringify(tokenObject)).toString('base64');
// Result: eyJ0aW1lc3RhbXAiOjE3NjQwOTg4Njk0Mzd9

// Final header value
const browserTokenHeader = JSON.stringify({ token: base64Token });
// Result: {"token":"eyJ0aW1lc3RhbXAiOjE3NjQwOTg4Njk0Mzd9"}
```

### Device ID
Use UUID v4 format:
```javascript
const crypto = require('crypto');
const deviceId = crypto.randomUUID();
// Example: d6d9cb68-255f-4da8-a39d-76d36b1454af
```

---

## API Endpoints

### 1. Get User Tracks (All)

**Endpoint:**
```
GET /api/feed/v2?hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=0
```

**Query Parameters:**
- `hide_disliked=true` - не показувати дизлайкнуті треки
- `hide_gen_stems=true` - не показувати stem файли
- `hide_studio_clips=true` - не показувати студійні кліпи
- `page=0` - номер сторінки (пагінація)

**Response:**
```json
{
  "clips": [
    {
      "id": "uuid-string",
      "title": "Song Title",
      "display_name": "Artist Name",
      "image_url": "https://cdn1.suno.ai/image-uuid.png",
      "image_large_url": "https://cdn1.suno.ai/large-uuid.webp",
      "audio_url": "https://cdn1.suno.ai/audio-uuid.mp3",
      "metadata": {
        "duration": 180.5,
        "tags": "pop, electronic, upbeat",
        "prompt": "..."
      },
      "is_liked": false,
      "play_count": 42,
      "status": "complete",
      "created_at": "2024-11-25T10:30:00Z"
    }
  ]
}
```

---

### 2. Get Liked Tracks

**Endpoint:**
```
GET /api/feed/v2?is_liked=true&hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=0
```

**Query Parameters:**
- `is_liked=true` - тільки лайкнуті треки
- інші параметри як у `/api/feed/v2`

**Response:** Same as Get User Tracks

---

### 3. Get Playbar State

**Endpoint:**
```
GET /api/music_player/playbar_state
```

**Response:**
```json
{
  "current_clip_id": "uuid-or-null",
  "is_playing": false,
  "current_time": 0
}
```

---

### 4. Get Usage Plan

**Endpoint:**
```
GET /api/billing/usage-plan-descriptions/
```

**Response:**
```json
{
  "plan_name": "free",
  "credits_remaining": 50,
  "credits_total": 50,
  "renewal_date": "2024-12-01T00:00:00Z"
}
```

---

## Authentication Flow

### 1. OAuth with Google

User navigates to:
```
https://accounts.suno.com/sign-in?redirect_url=https%3A%2F%2Fsuno.com%2Flibrary
```

### 2. Google OAuth Redirect

Redirects to Google OAuth:
```
https://accounts.google.com/v3/signin/identifier?
  client_id=864619725951-na3uleaalbekeilaalb3ak9qdpuoddeo.apps.googleusercontent.com
  &redirect_uri=https://clerk.suno.com/v1/oauth_callback
  &response_type=code
  &scope=openid+email+profile
```

### 3. Clerk Callback

After successful Google auth:
```
https://clerk.suno.com/v1/oauth_callback?
  state=...
  &code=...
  &scope=email+profile+openid
```

### 4. Final Redirect

Redirects to Suno with session cookie:
```
https://suno.com/library
```

**Cookies Set:**
- `__session` - JWT token (httpOnly, secure)
- `__client_uat` - Unix timestamp of auth
- Others (tracking, etc.)

---

## Track Object Structure

```typescript
interface Track {
  id: string;                    // UUID
  title: string;                 // Song title
  display_name: string;          // Artist name (user display name)
  image_url: string;             // Cover image (small)
  image_large_url: string;       // Cover image (large)
  audio_url: string;             // MP3 audio file
  metadata: {
    duration: number;            // Duration in seconds
    tags: string;                // Comma-separated tags
    prompt?: string;             // Generation prompt
    type?: string;               // "gen" or other
    refund_credits?: boolean;
    stream?: boolean;
    error_type?: string | null;
    error_message?: string | null;
  };
  is_liked: boolean;             // User liked this track
  is_trashed: boolean;           // User deleted this track
  is_disliked: boolean;          // User disliked
  reaction: null | object;
  play_count: number;            // Total plays
  upvote_count: number;          // Total upvotes
  status: string;                // "complete", "streaming", "error"
  created_at: string;            // ISO 8601 timestamp
  model_name: string;            // AI model version
  video_url?: string;            // Video URL if exists
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired session"
}
```

**Solution:** Re-authenticate

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Access denied"
}
```

**Solution:** Check account status

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```

**Solution:** Wait and retry with exponential backoff

---

## Rate Limits

- **Feed API:** ~60 requests/minute
- **Audio playback:** No strict limit (CDN)
- **Authentication:** 10 attempts/hour

---

## Best Practices

1. **Cache tracks locally** - reduce API calls
2. **Use pagination** - don't load all tracks at once
3. **Respect rate limits** - implement exponential backoff
4. **Validate session** - check cookie before requests
5. **Error handling** - retry on network errors
6. **CDN caching** - cache images and audio files

---

## Example Request (Node.js)

```javascript
const https = require('https');

function fetchTracks(sessionCookie) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const browserToken = Buffer.from(JSON.stringify({ timestamp })).toString('base64');
    const browserTokenHeader = JSON.stringify({ token: browserToken });
    const deviceId = require('crypto').randomUUID();
    
    const options = {
      hostname: 'studio-api.prod.suno.com',
      port: 443,
      path: '/api/feed/v2?hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=0',
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Origin': 'https://suno.com',
        'Referer': 'https://suno.com/',
        'browser-token': browserTokenHeader,
        'device-id': deviceId,
        'Cookie': `__session=${sessionCookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Usage
fetchTracks('your_session_cookie_here')
  .then(data => console.log(`Found ${data.clips.length} tracks`))
  .catch(err => console.error('Error:', err));
```

---

## Security Notes

⚠️ **Important:**
- Never commit `__session` cookie to version control
- Cookies are **httpOnly** and **secure** - handle with care
- Session expires after ~30 days of inactivity
- Use HTTPS for all API requests
- Don't share session cookies - they grant full account access

---

## Useful Resources

- [Suno AI Official](https://suno.com)
- [Clerk Auth Docs](https://clerk.com/docs)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

---

**Last Updated:** 2024-11-25  
**API Version:** v2  
**Maintained by:** [@ozzy404](https://github.com/ozzy404)
