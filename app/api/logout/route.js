export async function POST() {
  const response = Response.json({ success: true });
  response.headers.append('Set-Cookie', 'otess_mfa_id=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  return response;
}
