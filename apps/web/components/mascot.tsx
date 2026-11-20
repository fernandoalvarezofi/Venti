/**
 * Mascota de Lintick (la entrada con gorra). Una sola imagen, tres "actitudes" hechas con CSS:
 *  - jump: salta en el lugar (inicio).
 *  - peek: se asoma desde atrás de una tarjeta (estados vacíos).
 *  - wave: se balancea saludando, con globo de diálogo (ingreso, registro, página inexistente).
 * Con "reducir movimiento" activado en el sistema queda quieta.
 */
type Pose = 'jump' | 'peek' | 'wave';

const SRC = '/mascota/lintick-640.webp';
const SRCSET = '/mascota/lintick-320.webp 320w, /mascota/lintick-640.webp 640w, /mascota/lintick-1162.webp 1162w';

export function Mascot({
  pose,
  size = 200,
  say,
  className = '',
  priority = false,
}: {
  pose: Pose;
  /** Ancho en píxeles CSS. */
  size?: number;
  /** Texto del globo (sólo para "wave"). */
  say?: string;
  className?: string;
  priority?: boolean;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC}
      srcSet={SRCSET}
      sizes={`${size}px`}
      width={1162}
      height={1175}
      alt=""
      draggable={false}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className="mascot-img block h-auto w-full select-none"
    />
  );

  if (pose === 'peek') {
    return (
      <div aria-hidden className={`mascot-peek ${className}`} style={{ width: size, height: Math.round(size * 0.62) }}>
        {img}
      </div>
    );
  }

  return (
    <div aria-hidden={!say} className={className} style={{ width: size }}>
      <div className={`mascot mascot-${pose} relative`}>
      {pose === 'wave' && say ? (
        <p className="mascot-bubble absolute -top-2 left-[62%] z-10 whitespace-nowrap rounded-2xl rounded-bl-sm bg-ink px-3.5 py-2 text-sm font-bold text-paper shadow-lg">
          {say}
        </p>
      ) : null}
      <div className="mascot-body">{img}</div>
      {pose === 'jump' ? <div className="mascot-shadow" /> : null}
      </div>
    </div>
  );
}
