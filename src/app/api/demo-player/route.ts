import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const title = escapeHtml(search.get("title") ?? "CineVerse");
  const language = escapeHtml(search.get("language") ?? "vostfr");
  const mediaType = escapeHtml(search.get("mediaType") ?? "movie");
  const season = escapeHtml(search.get("season") ?? "1");
  const episode = escapeHtml(search.get("episode") ?? "1");

  return new NextResponse(
    `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { height: 100%; margin: 0; background: #050505; color: #fff; font-family: Inter, Arial, sans-serif; }
    body { display: grid; place-items: center; overflow: hidden; }
    .stage { position: relative; width: 100%; height: 100%; display: grid; place-items: center; background:
      radial-gradient(circle at 20% 20%, rgba(229, 9, 20, .25), transparent 32%),
      linear-gradient(145deg, #060606 0%, #161616 55%, #2b070b 100%); }
    .beam { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent); animation: scan 5s linear infinite; }
    .content { width: min(82vw, 760px); text-align: center; z-index: 1; }
    h1 { margin: 0; font-size: clamp(30px, 6vw, 74px); letter-spacing: 0; }
    p { margin: 14px 0 24px; color: #c7c7c7; font-size: 15px; }
    .bar { height: 8px; background: rgba(255,255,255,.18); border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; width: 0; background: #e50914; }
    .meta { display: flex; justify-content: center; gap: 12px; margin-top: 18px; color: #f1f1f1; font-size: 13px; }
    @keyframes scan { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
  </style>
</head>
<body>
  <main class="stage">
    <div class="beam"></div>
    <section class="content">
      <h1>${title}</h1>
      <p>Flux de demonstration local</p>
      <div class="bar"><span id="progress"></span></div>
      <div class="meta"><span>${mediaType}</span><span>${language}</span><span>S${season} E${episode}</span></div>
    </section>
  </main>
  <script>
    const duration = 5400;
    let currentTime = Number(localStorage.getItem("cineverse-demo-time") || 0);
    const progress = document.getElementById("progress");
    function tick() {
      currentTime = Math.min(duration, currentTime + 5);
      localStorage.setItem("cineverse-demo-time", String(currentTime));
      progress.style.width = ((currentTime / duration) * 100).toFixed(2) + "%";
      window.parent.postMessage({
        type: "cineverse:timeupdate",
        currentTime,
        duration
      }, "*");
      if (currentTime < duration) window.setTimeout(tick, 5000);
    }
    tick();
  </script>
</body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}
