/**
 * Test API route to verify request handling
 */

export async function POST(request) {
  console.log('[DEBUG API] === TEST REQUEST ===');
  console.log('[DEBUG API] Headers:', Object.fromEntries(request.headers));
  
  const cloned = request.clone();
  const text = await cloned.text();
  console.log('[DEBUG API] Body text:', text);
  
  const body = JSON.parse(text);
  console.log('[DEBUG API] Parsed:', body);
  
  return Response.json({
    received: body,
    keys: Object.keys(body),
    success: true
  });
}
