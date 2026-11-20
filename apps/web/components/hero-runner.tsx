/**
 * La mascota corre de punta a punta sobre el buscador, salta en el medio, se da vuelta y vuelve.
 * Tres capas de movimiento (sólo CSS, transform):
 *  - .runner-x    : el recorrido de lado a lado (y el giro al llegar a cada punta).
 *  - .runner-jump : los saltos grandes (con agachada antes y aplastamiento al caer).
 *  - .runner-bob  : el trote continuo (sube y baja rápido, con un leve balanceo).
 * Decorativa: no recibe clics ni la leen los lectores de pantalla.
 */
export function HeroRunner() {
  return (
    <div className="runner-track" aria-hidden>
      <div className="runner-x">
        <div className="runner-flip">
          <div className="runner-jump">
            <div className="runner-bob">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascota/lintick-320.webp" srcSet="/mascota/lintick-320.webp 320w, /mascota/lintick-640.webp 640w" sizes="120px" width={1162} height={1175} alt="" draggable={false} className="block h-auto w-full select-none" />
            </div>
          </div>
        </div>
        <div className="runner-shadow" />
      </div>
    </div>
  );
}
