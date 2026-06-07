# Auth Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  subscription_tier: 'free',
  onboarding_complete: true,
  business_type: 'sole_trader',
  business_name: 'Test Business',
  abn: '12345678901',
  gst_registered: true,
  industry: 'Consulting',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  session_id: 'sess_' + Date.now(),
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
# Test auth endpoint
curl -X GET "https://quicktax-au.preview.emergentagent.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test income endpoint
curl -X GET "https://quicktax-au.preview.emergentagent.com/api/income" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "quicktax-au.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://quicktax-au.preview.emergentagent.com/dashboard")
```

## Checklist
- [ ] User document has user_id field (custom UUID)
- [ ] Session user_id matches user's user_id
- [ ] All queries use {"_id": 0} projection
- [ ] Backend queries use user_id (not _id)
- [ ] API returns user data (not 401/404)
- [ ] Dashboard loads without redirect

## Success Indicators
✅ /api/auth/me returns user data
✅ Dashboard loads without redirect to login
✅ CRUD operations work for income/expenses

## Test Credentials (MongoDB injected)
See /app/memory/test_credentials.md
