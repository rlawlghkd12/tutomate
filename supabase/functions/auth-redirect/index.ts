Deno.serve((_req) => {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Login Complete</title></head>
<body style="font-family:sans-serif;text-align:center;padding-top:100px;">
<h2>Login successful!</h2>
<p>This window will close automatically.</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
  });
});
