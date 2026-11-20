import type { Metadata } from 'next';
import Link from 'next/link';
import { PAYMENTS_LIVE } from '@/lib/config';

export const metadata: Metadata = { title: 'Guía paso a paso' };

const SECTIONS: { id: string; title: string; steps: { t: string; d: React.ReactNode }[] }[] = [
  {
    id: 'cuenta',
    title: 'Tu cuenta',
    steps: [
      { t: 'Creá tu cuenta', d: <>Entrá a <Link href="/registrarse" className="font-semibold underline">Crear cuenta</Link> con tu email y una contraseña. Te mandamos un enlace para confirmar tu email.</> },
      { t: 'Confirmá tu email', d: 'Abrí el enlace del email. Hasta que no lo confirmes, la cuenta no se puede usar: así nadie puede registrarse con tu correo.' },
    ],
  },
  {
    id: 'productora',
    title: 'Tu productora',
    steps: [
      { t: 'Creá tu productora', d: <>En el <Link href="/business" className="font-semibold underline">panel de productora</Link>, completá el nombre (y, si querés, razón social y CUIT). Quedás como dueño.</> },
      { t: 'Sumá a tu equipo', d: 'En “Equipo” agregás personas con su rol: administración, encargados, ventas o personal de acceso. Cada rol ve sólo lo que necesita.' },
    ],
  },
  {
    id: 'evento',
    title: 'Tu evento',
    steps: [
      { t: 'Creá el evento', d: 'Desde “Nuevo evento”: título, categoría, fechas, lugar, descripción y portada (opcional).' },
      { t: 'Cargá las entradas', d: 'Agregá tipos de entrada (campo, platea, VIP…) con su capacidad y sus etapas de precio: por ejemplo Preventa 1, Preventa 2 y General. Cambian solas por fecha o cantidad vendida.' },
      { t: 'Completá el contenido', d: 'En la pestaña “Contenido”: galería, line-up con artistas invitados, qué hay en el evento, apertura de puertas, edad mínima, enlaces y condiciones.' },
      { t: 'Publicá', d: 'Cuando la lista “Para vender más” esté completa, tocá “Publicar”. El evento aparece en Lintick y ya se puede comprar.' },
    ],
  },
  {
    id: 'cobros',
    title: 'Cobros',
    steps: [
      {
        t: 'Conectá Mercado Pago',
        d: PAYMENTS_LIVE
          ? 'En el panel, “Cobros” → “Conectar Mercado Pago”. Iniciás sesión en Mercado Pago y autorizás a Lintick: cada venta se acredita directo en tu cuenta.'
          : 'Muy pronto: desde el panel vas a conectar tu cuenta de Mercado Pago con un botón y cada venta se va a acreditar directo en tu cuenta.',
      },
      { t: 'Cargo por servicio', d: 'La productora cobra el precio completo de cada entrada. El comprador paga además un cargo por servicio del 10%, que ve antes de pagar: es el ingreso de Lintick. Las cortesías y las entradas gratuitas no tienen cargo.' },
      { t: 'Cortesías', d: 'En la pestaña “Entradas” emitís cortesías a un email: descuentan stock real y llegan con su QR.' },
    ],
  },
  {
    id: 'puerta',
    title: 'La puerta',
    steps: [
      { t: 'Asigná turnos al personal', d: 'En la pestaña “Equipo” del evento, elegís quién controla y en qué horario. Fuera de su turno no puede escanear.' },
      { t: 'Abrí el control de ingreso', d: 'Desde el celular: menú de tu cuenta → “Control de ingreso”, o el botón dentro del evento. Permití la cámara y escaneá.' },
      { t: 'Sin señal también funciona', d: 'Con señal, el celular descarga la lista de entradas. Si la señal se corta, sigue validando y sube los ingresos cuando vuelve la conexión.' },
      { t: 'Seguí el ingreso en vivo', d: 'El contador muestra cuántos entraron y los últimos ingresos con su puerta. Después podés descargar la planilla de asistentes.' },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <p className="eyebrow">Centro de ayuda</p>
      <h1 className="mt-3 text-[clamp(2.4rem,6vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.04em]">El paso a paso de Lintick</h1>
      <p className="mt-4 max-w-xl text-muted">Todo lo que necesitás para crear tu productora, publicar tu primer evento, cobrar y controlar la puerta.</p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Secciones de la guía" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 hover:text-ink">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-12">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24" aria-labelledby={`${s.id}-t`}>
              <h2 id={`${s.id}-t`} className="text-2xl font-bold">
                {s.title}
              </h2>
              <ol className="mt-5 space-y-3">
                {s.steps.map((st, i) => (
                  <li key={st.t} className="flex gap-4 rounded-[14px] bg-surface p-5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-paper">{i + 1}</span>
                    <div>
                      <h3 className="font-semibold">{st.t}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{st.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
