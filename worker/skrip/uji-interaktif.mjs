import { strict as assert } from "node:assert";
import { createServer } from "node:http";

let gagal = false;
let permintaan = null;

const server = createServer(async (req, res) => {
  const bagian = [];
  for await (const potong of req) bagian.push(potong);
  permintaan = {
    method: req.method,
    url: req.url,
    body: JSON.parse(Buffer.concat(bagian).toString("utf8")),
  };
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
  console.log("OK - pengiriman List Message dan jalur kegagalannya lulus.");
} finally {
  await new Promise((selesai) => server.close(selesai));
}

