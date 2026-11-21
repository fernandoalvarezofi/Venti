import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_URL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidad"
      updated="20 de noviembre de 2026"
      intro={
        <p>
          Esta política explica qué datos personales usa Lintick, para qué y cómo los cuidamos. Aplica a la web de Lintick, al panel de productoras y a Lintick Access (control de ingreso). La
          tratamos conforme a la Ley 25.326 de Protección de Datos Personales de la República Argentina.
        </p>
      }
      sections={[
        {
          id: 'datos',
          title: 'Qué datos usamos',
          body: (
            <ul>
              <li>
                <b>Tu cuenta:</b> nombre y apellido, email y una contraseña que guardamos cifrada (nunca la vemos). Si entrás con Google, recibimos de Google sólo tu nombre, tu email y un
                identificador de tu cuenta de Google. No accedemos a tus contactos, archivos ni a ningún otro dato de Google.
              </li>
              <li>
                <b>Tus entradas:</b> los eventos para los que tenés entradas, el tipo de entrada y si ya ingresaste (puerta y hora).
              </li>
              <li>
                <b>DNI del titular</b> (cuando el evento lo pide): se guarda protegido. En la puerta sólo se muestran los últimos 3 números.
              </li>
              <li>
                <b>Pagos:</b> los procesa Mercado Pago. Lintick no recibe ni guarda los datos de tu tarjeta; sólo el resultado del pago (aprobado, rechazado o devuelto) y su número de operación.
              </li>
              <li>
                <b>Seguridad:</b> dirección IP y tipo de navegador de cada sesión abierta, para detectar accesos indebidos y para que puedas cerrar sesiones.
              </li>
            </ul>
          ),
        },
        {
          id: 'para-que',
          title: 'Para qué los usamos',
          body: (
            <ul>
              <li>Crear tu cuenta, reservar y emitir tus entradas y mostrarlas en “Mis entradas”.</li>
              <li>Validar tu entrada en la puerta del evento (una sola vez por entrada).</li>
              <li>Enviarte los emails necesarios: confirmación de cuenta, cambio de contraseña y avisos sobre tus entradas.</li>
              <li>Prevenir fraudes, reventa no autorizada y accesos indebidos a tu cuenta.</li>
            </ul>
          ),
        },
        {
          id: 'productoras',
          title: 'Qué ve la productora del evento',
          body: (
            <p>
              Cuando comprás o recibís una entrada, la productora que organiza ese evento ve el nombre del titular, su email y el estado de la entrada, para gestionar el ingreso y comunicarse por
              cambios en el evento. No ve tu contraseña ni datos de tu tarjeta. Las productoras sólo pueden usar esos datos para su evento.
            </p>
          ),
        },
        {
          id: 'terceros',
          title: 'Con quién los compartimos',
          body: (
            <>
              <p>No vendemos tus datos. Sólo los compartimos con los servicios que hacen funcionar Lintick:</p>
              <ul>
                <li>Mercado Pago, para procesar pagos.</li>
                <li>Google, sólo si elegís entrar con tu cuenta de Google.</li>
                <li>Proveedores de infraestructura (alojamiento web y base de datos) que guardan la información por cuenta de Lintick.</li>
              </ul>
              <p>También podemos entregar datos si una autoridad competente lo exige conforme a la ley.</p>
            </>
          ),
        },
        {
          id: 'conservacion',
          title: 'Cuánto tiempo los guardamos',
          body: (
            <p>
              Mientras tengas una cuenta activa, y después el tiempo que exijan las obligaciones legales y contables. Los datos que Lintick Access descarga en los celulares del personal de la
              puerta para funcionar sin señal se borran solos al terminar el evento.
            </p>
          ),
        },
        {
          id: 'derechos',
          title: 'Tus derechos',
          body: (
            <>
              <p>
                Para pedirlo escribinos por WhatsApp al{' '}
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  {SUPPORT_WHATSAPP}
                </a>
                . Te respondemos dentro de los 10 días corridos que fija la ley.
              </p>
              <p>
                Podés pedir acceso, rectificación, actualización o eliminación de tus datos en cualquier momento y en forma gratuita (art. 14 y 16 de la Ley 25.326). Podés cambiar tu contraseña
                desde <Link href="/recuperar">Recuperar contraseña</Link> y cerrar sesión desde el menú de tu cuenta.
              </p>
              <p>
                La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con
                relación al incumplimiento de las normas sobre protección de datos personales.
              </p>
            </>
          ),
        },
        {
          id: 'seguridad',
          title: 'Cómo los cuidamos',
          body: (
            <p>
              Toda la comunicación viaja cifrada (HTTPS). Las contraseñas se guardan con un algoritmo de cifrado de un solo sentido, los QR de las entradas están firmados digitalmente y la
              información de cada productora está aislada de las demás. Ningún sistema es infalible: si detectamos un problema que afecte tus datos, te vamos a avisar.
            </p>
          ),
        },
        {
          id: 'cambios',
          title: 'Cambios a esta política',
          body: <p>Si cambiamos algo importante, lo vas a ver publicado en esta página con su nueva fecha, y si corresponde te avisamos por email.</p>,
        },
      ]}
    />
  );
}
