import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { inspectImage, stripImageMetadata } from '../src/lib/images.ts';
import { call, inDays, publishedEvent, registerUser, setupApp, type TestContext } from './helpers.ts';

// ─── Imágenes mínimas válidas (sólo cabeceras: alcanza para el verificador) ───
function png(w: number, h: number, padding = 64): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.alloc(padding, 1)]);
}
function jpeg(w: number, h: number, withExif = false): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (withExif) {
    const exif = Buffer.from('Exif\0\0GPS-DATA', 'binary');
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xffe1, 0);
    seg.writeUInt16BE(exif.length + 2, 2);
    parts.push(seg, exif);
  }
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  parts.push(sof, Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.alloc(32, 7), Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}
function webpVp8x(w: number, h: number, exifFlag = false): Buffer {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(32, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b[20] = exifFlag ? 0x08 : 0;
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

describe('verificador de imágenes', () => {
  it('reconoce PNG, JPEG y WebP por su contenido y lee el tamaño', () => {
    expect(inspectImage(png(1200, 630))).toMatchObject({ contentType: 'image/png', width: 1200, height: 630 });
    expect(inspectImage(jpeg(1600, 900))).toMatchObject({ contentType: 'image/jpeg', width: 1600, height: 900 });
    expect(inspectImage(webpVp8x(1080, 1350))).toMatchObject({ contentType: 'image/webp', width: 1080, height: 1350 });
  });
  it('rechaza archivos que no son imágenes aunque digan serlo', () => {
    expect(() => inspectImage(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow(/JPG, PNG o WebP/);
    expect(() => inspectImage(Buffer.from('%PDF-1.7 ...'))).toThrow(/JPG, PNG o WebP/);
  });
  it('rechaza fotos con metadatos EXIF sin limpiar; stripImageMetadata los quita (JPEG y WebP)', () => {
    expect(() => inspectImage(jpeg(1600, 900, true))).toThrow(/metadatos/);
    expect(() => inspectImage(webpVp8x(1600, 900, true))).toThrow(/metadatos/);
    expect(inspectImage(stripImageMetadata(jpeg(1600, 900, true)))).toMatchObject({ width: 1600, height: 900 });
    expect(inspectImage(stripImageMetadata(webpVp8x(1600, 900, true)))).toMatchObject({ width: 1600, height: 900 });
  });
  it('rechaza imágenes muy chicas, enormes o vacías', () => {
    expect(() => inspectImage(png(300, 300))).toThrow(/muy chica/);
    expect(() => inspectImage(png(7000, 4000))).toThrow(/muy grande/);
    expect(() => inspectImage(Buffer.alloc(0))).toThrow(/vacío/);
    expect(() => inspectImage(Buffer.concat([png(1000, 1000), Buffer.alloc(3 * 1024 * 1024)]))).toThrow(/3 MB/);
  });
});

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupApp();
});
afterAll(async () => {
  await ctx.venti.close();
  await ctx.owner.close();
});

async function upload(orgId: string, eventId: string, token: string, body: Buffer, kind: 'cover' | 'gallery', type = 'image/png') {
  const res = await ctx.venti.app.inject({
    method: 'POST',
    url: `/v1/organizations/${orgId}/events/${eventId}/media?kind=${kind}`,
    headers: { authorization: `Bearer ${token}`, 'content-type': type },
    payload: body,
    remoteAddress: `10.20.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  return { status: res.statusCode, body: res.json() };
}

describe('imágenes del evento', () => {
  it('portada: se sube, aparece en el catálogo, se sirve con caché y reemplaza a la anterior', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const first = await upload(orgId, eventId, owner.token, png(1200, 630), 'cover');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ url: `/v1/media/${first.body.id}`, width: 1200, height: 630 });

    const list = await call(ctx, 'GET', '/v1/public/events?limit=50');
    expect(list.body.items.find((e: { id: string }) => e.id === eventId).coverImage.id).toBe(first.body.id);

    const img = await ctx.venti.app.inject({ method: 'GET', url: first.body.url });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(img.rawPayload.subarray(0, 4).toString('hex')).toBe('89504e47');
    const cached = await ctx.venti.app.inject({ method: 'GET', url: first.body.url, headers: { 'if-none-match': String(img.headers.etag) } });
    expect(cached.statusCode).toBe(304);

    const second = await upload(orgId, eventId, owner.token, jpeg(1600, 900), 'cover', 'image/jpeg');
    expect(second.status).toBe(201);
    expect((await ctx.venti.app.inject({ method: 'GET', url: first.body.url })).statusCode).toBe(404);
    expect((await call(ctx, 'GET', `/v1/public/events/${eventId}`)).body.coverImage.id).toBe(second.body.id);
  });

  it('galería de hasta 8; borrar libera lugar', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await upload(orgId, eventId, owner.token, png(800, 800, 64 + i), 'gallery')).body.id);
    const ninth = await upload(orgId, eventId, owner.token, png(800, 800), 'gallery');
    expect(ninth.status).toBe(409);
    expect(ninth.body.error.code).toBe('gallery_full');
    expect((await call(ctx, 'DELETE', `/v1/organizations/${orgId}/events/${eventId}/media/${ids[0]}`, { token: owner.token })).status).toBe(204);
    expect((await upload(orgId, eventId, owner.token, png(800, 800), 'gallery')).status).toBe(201);
    expect((await call(ctx, 'GET', `/v1/public/events/${eventId}`)).body.gallery).toHaveLength(8);
  });

  it('borradores: la imagen no es pública, pero la productora la ve; otra productora no puede subir', async () => {
    const owner = await registerUser(ctx);
    const stranger = await registerUser(ctx);
    const { orgId } = await publishedEvent(ctx, owner.token);
    const draft = await call(ctx, 'POST', `/v1/organizations/${orgId}/events`, {
      token: owner.token,
      body: { title: 'Borrador con foto', category: 'music', startsAt: inDays(20), endsAt: inDays(21) },
    });
    const up = await upload(orgId, draft.body.id, owner.token, png(1000, 600), 'cover');
    expect((await ctx.venti.app.inject({ method: 'GET', url: up.body.url })).statusCode).toBe(404);
    const asOrg = await ctx.venti.app.inject({ method: 'GET', url: `${up.body.url}?org=${orgId}`, headers: { authorization: `Bearer ${owner.token}` } });
    expect(asOrg.statusCode).toBe(200);
    expect(asOrg.headers['cache-control']).toContain('no-store');
    expect((await upload(orgId, draft.body.id, stranger.token, png(1000, 600), 'cover')).status).toBe(404);
  });

  it('rechaza archivos que no son imágenes; a las fotos con EXIF les quita los metadatos y las guarda', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    expect((await upload(orgId, eventId, owner.token, Buffer.from('no soy una imagen pero digo que sí'), 'cover')).status).toBe(415);
    // Safari agrega EXIF al re-codificar en el teléfono: no se rechaza, se limpia y lo guardado no tiene EXIF.
    const up = await upload(orgId, eventId, owner.token, jpeg(1600, 900, true), 'cover', 'image/jpeg');
    expect(up.status).toBe(201);
    const stored = await ctx.owner.pool.query('select bytes from event_media where id = $1', [up.body.id]);
    const bytes: Buffer = stored.rows[0].bytes;
    expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
    expect(bytes.includes(Buffer.from('GPS-DATA'))).toBe(false);
    expect(inspectImage(bytes)).toMatchObject({ width: 1600, height: 900 });
  });
});

describe('contenido del evento', () => {
  it('line-up con invitados, qué hay en la fiesta, datos útiles y enlaces validados', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const base = `/v1/organizations/${orgId}/events/${eventId}`;
    const ok = await call(ctx, 'PATCH', base, {
      token: owner.token,
      body: {
        lineup: [
          { name: 'Los Tres Soles', role: 'headliner', startsAt: inDays(30), stage: 'Principal' },
          { name: 'Invitada Sorpresa', role: 'guest' },
          { name: 'DJ Residente', role: 'resident' },
        ],
        amenities: ['bar', 'food_trucks', 'cloakroom', 'bar'],
        extraAmenities: ['Feria de diseño'],
        doorsOpenAt: inDays(29.9),
        minAge: 18,
        dressCode: 'Informal',
        links: { instagram: 'https://www.instagram.com/lostressoles', spotify: 'https://open.spotify.com/artist/123' },
        policies: 'No se permite el ingreso con bebidas.',
      },
    });
    expect(ok.status).toBe(200);
    const pub = await call(ctx, 'GET', `/v1/public/events/${eventId}`);
    expect(pub.body.lineup.map((l: { name: string; role: string }) => `${l.role}:${l.name}`)).toEqual(['headliner:Los Tres Soles', 'guest:Invitada Sorpresa', 'resident:DJ Residente']);
    expect(pub.body.amenities).toEqual(['bar', 'food_trucks', 'cloakroom']); // sin duplicados
    expect(pub.body).toMatchObject({ minAge: 18, dressCode: 'Informal', extraAmenities: ['Feria de diseño'], policies: 'No se permite el ingreso con bebidas.' });
    expect(pub.body.links.instagram).toBe('https://www.instagram.com/lostressoles');

    // Validaciones: enlace de otro sitio, http, edad imposible, servicio inexistente.
    for (const body of [
      { links: { instagram: 'https://phishing.example/instagram' } },
      { links: { website: 'http://sin-https.example' } },
      { minAge: 40 },
      { amenities: ['jacuzzi'] },
    ]) {
      expect((await call(ctx, 'PATCH', base, { token: owner.token, body })).status).toBe(400);
    }
  });

  it('personalización: videos, artistas con foto y bio, patrocinadores con logo, preguntas, contacto, SEO y orden de secciones', async () => {
    const owner = await registerUser(ctx);
    const { orgId, eventId } = await publishedEvent(ctx, owner.token);
    const base = `/v1/organizations/${orgId}/events/${eventId}`;
    const logo = (await upload(orgId, eventId, owner.token, png(600, 600, 70), 'asset' as 'cover')).body.id as string;
    const photo = (await upload(orgId, eventId, owner.token, png(600, 600, 71), 'asset' as 'cover')).body.id as string;
    const body = {
      summary: 'La fiesta de fin de año más grande del pueblo.',
      videos: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Aftermovie 2025' }, { url: 'https://vimeo.com/76979871' }],
      lineup: [{ name: 'Los Tres Soles', role: 'headliner', bio: 'Banda de rock de Lincoln.', link: 'https://lostressoles.com.ar', imageId: photo }],
      sponsors: [{ name: 'Cervecería Norte', tier: 'sponsor', url: 'https://cerveceria.example', logoId: logo }, { name: 'Radio Pueblo', tier: 'media' }],
      faq: [{ q: '¿Hay estacionamiento?', a: 'Sí, gratis en la cuadra.' }],
      contact: { email: 'Hola@Productora.example', whatsapp: '+54 9 2355 123456' },
      seo: { title: 'Fiesta de fin de año en Lincoln', description: 'Entradas para la fiesta de fin de año.' },
      pageSections: [{ key: 'videos', visible: true }, { key: 'lineup', visible: true }, { key: 'faq', visible: false }],
    };
    expect((await call(ctx, 'PATCH', base, { token: owner.token, body })).status).toBe(200);
    const pub = (await call(ctx, 'GET', `/v1/public/events/${eventId}`)).body;
    expect(pub).toMatchObject({ summary: body.summary, faq: body.faq, seo: body.seo, pageSections: body.pageSections });
    expect(pub.contact).toEqual({ email: 'hola@productora.example', whatsapp: '+54 9 2355 123456' });
    expect(pub.videos).toEqual([{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Aftermovie 2025' }, { url: 'https://vimeo.com/76979871', title: '' }]);
    expect(pub.lineup[0]).toMatchObject({ bio: 'Banda de rock de Lincoln.', link: 'https://lostressoles.com.ar', imageId: photo });
    expect(pub.sponsors).toEqual([
      { name: 'Cervecería Norte', tier: 'sponsor', url: 'https://cerveceria.example', logoId: logo },
      { name: 'Radio Pueblo', tier: 'media', url: null, logoId: null },
    ]);

    // Un logo borrado no deja una imagen rota: la referencia desaparece.
    expect((await call(ctx, 'DELETE', `${base}/media/${logo}`, { token: owner.token })).status).toBe(204);
    expect((await call(ctx, 'GET', `/v1/public/events/${eventId}`)).body.sponsors[0].logoId).toBeNull();

    // Validaciones: video de otro sitio, imagen de OTRO evento, sección repetida, whatsapp con letras.
    const other = await publishedEvent(ctx, owner.token);
    const foreign = (await upload(other.orgId, other.eventId, owner.token, png(600, 600, 72), 'asset' as 'cover')).body.id as string;
    expect(foreign).toMatch(/^[0-9a-f-]{36}$/);
    for (const bad of [
      { videos: [{ url: 'https://videos.example/v/1' }] },
      { sponsors: [{ name: 'Ajena', logoId: foreign }] },
      { pageSections: [{ key: 'faq', visible: true }, { key: 'faq', visible: false }] },
      { contact: { whatsapp: 'llamame' } },
    ]) {
      const res = await call(ctx, 'PATCH', base, { token: owner.token, body: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
