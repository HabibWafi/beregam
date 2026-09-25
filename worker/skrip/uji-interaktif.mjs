import { strict as assert } from "node:assert";
import { createServer } from "node:http";

let gagal = false;
let permintaan = null;
let statusSesi = "FAILED";
const aksiSesi = [];

const server = createServer(async (req, res) => {
  const bagian = [];
  for await (const potong of req) bagian.push(potong);
  const badanMentah = Buffer.concat(bagian).toString("utf8");
  permintaan = {
    method: req.method,
    url: req.url,
    body: badanMentah ? JSON.parse(badanMentah) : null,
  };

  if (req.method === "GET" && req.url === "/api/sessions/default") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: statusSesi }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/sessions/default/stop") {
    aksiSesi.push("stop");
    statusSesi = "STOPPED";
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/api/sessions/default/start") {
    aksiSesi.push("start");
    statusSesi = "WORKING";
    res.writeHead(204);
    res.end();
    return;
  }

  if (gagal) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"message":"uji gagal"}');
    return;
  }
  res.writeHead(201, { "Content-Type": "application/json" });
  res.end('{"key":{"id":"LIST-UJI-1"}}');
});

await new Promise((selesai) => server.listen(0, "127.0.0.1", selesai));
const alamat = server.address();
assert.ok(alamat && typeof alamat === "object");

process.env.PESTA_BASE_URL = "https://example.invalid";
process.env.BEREGAM_API_KEY = "x".repeat(32);
process.env.WAHA_API_KEY = "uji-lokal";
process.env.WAHA_BASE_URL = `http://127.0.0.1:${alamat.port}`;

try {
  const { WahaGateway } = await import("../dist/gateway.js");
  const gateway = new WahaGateway();
  const message = {
    title: "Menu Layanan Beregam",
    description: "Pilih layanan atau balas angka.",
    footer: "BPS Kabupaten Musi Rawas",
    button: "Pilih layanan",
    sections: [
      {
        title: "Layanan tersedia",
        rows: [{ title: "1. Jam layanan", rowId: "menu:1", description: null }],
      },
    ],
  };

  assert.equal(await gateway.sendList("628111111111@c.us", message), "LIST-UJI-1");
  assert.equal(permintaan.method, "POST");
  assert.equal(permintaan.url, "/api/sendList");
  assert.equal(permintaan.body.session, "default");
  assert.equal(permintaan.body.message.sections[0].rows[0].rowId, "menu:1");

  gagal = true;
  await assert.rejects(
    gateway.sendList("628111111111@c.us", message),
    /Engine gagal mengirim List Message/
  );

  assert.equal(await gateway.recoverSessionIfFailed(), "WORKING");
  assert.deepEqual(aksiSesi, ["stop", "start"]);
  console.log(
    "OK - pengiriman List Message, jalur kegagalan, dan pemulihan sesi lulus."
  );
} finally {
  await new Promise((selesai) => server.close(selesai));
}

