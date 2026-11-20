import QRCode from 'qrcode';

/**
 * QR real con la marca de Lintick: módulos redondeados, "ojos" con el naranja de la marca y la "L." al centro.
 * Corrección de errores H (30%): el logo tapa menos de eso, así que se puede escanear.
 * Verificado con jsQR (el mismo lector del escáner): lee a 600 px, a 200 px y con desenfoque.
 * Ojo: módulos totalmente circulares o un margen menor a 4 hacen que NO se pueda leer.
 */
export function BrandedQr({ value, className = '' }: { value: string; className?: string }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const at = (r: number, c: number) => qr.modules.get(r, c) === 1;
  const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // Hueco central para el logo (≈ 22% del lado, impar para quedar centrado).
  const hole = Math.max(5, Math.round(n * 0.22) | 1);
  const h0 = (n - hole) / 2;
  const inHole = (r: number, c: number) => r >= h0 - 0.5 && r < h0 + hole - 0.5 && c >= h0 - 0.5 && c < h0 + hole - 0.5;

  const dots: React.ReactNode[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!at(r, c) || inFinder(r, c) || inHole(r, c)) continue;
      dots.push(<rect key={`${r}-${c}`} x={c + 0.04} y={r + 0.04} width={0.92} height={0.92} rx={0.22} />);
    }

  const eye = (x: number, y: number) => (
    <g key={`eye-${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.9} fill="none" stroke="var(--color-ink)" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill="var(--color-accent)" />
    </g>
  );

  // Margen blanco de 4 módulos (el estándar): con menos, varios lectores no lo encuentran.
  const pad = 4;
  const cx = n / 2;
  const box = hole - 1;
  return (
    <svg viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`} className={className} role="img" aria-label="Código QR de Lintick">
      <rect x={-pad} y={-pad} width={n + pad * 2} height={n + pad * 2} rx={3} fill="#fff" />
      <g fill="var(--color-ink)">{dots}</g>
      {eye(0, 0)}
      {eye(n - 7, 0)}
      {eye(0, n - 7)}
      {/* Logo al centro: placa negra con la "L." */}
      <rect x={cx - box / 2} y={cx - box / 2} width={box} height={box} rx={box * 0.24} fill="var(--color-ink)" />
      <path
        d={`M${cx - box * 0.2} ${cx - box * 0.24} v${box * 0.46} h${box * 0.3}`}
        fill="none"
        stroke="var(--color-paper)"
        strokeWidth={box * 0.13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={cx + box * 0.24} cy={cx + box * 0.2} r={box * 0.085} fill="var(--color-accent)" />
    </svg>
  );
}
