import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_URL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Términos y condiciones' };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Términos y condiciones"
      updated="20 de noviembre de 2026"
      intro={
        <p>
          Estos términos regulan el uso de Lintick, la plataforma para comprar entradas y para que las productoras vendan las de sus eventos. Al crear una cuenta o comprar una entrada los
          aceptás. Leelos junto con la <Link href="/privacidad" className="font-semibold underline">Política de privacidad</Link>.
        </p>
      }
      sections={[
        {
          id: 'que-es',
          title: 'Qué es Lintick',
          body: (
            <p>
              Lintick es un intermediario: las productoras publican sus eventos y venden sus entradas a través de la plataforma. Cada evento es organizado por su productora, que es la responsable
              de realizarlo, de su contenido y de las condiciones de ingreso.
            </p>
          ),
        },
        {
          id: 'cuenta',
          title: 'Tu cuenta',
          body: (
            <ul>
              <li>Tenés que dar datos verdaderos y ser mayor de 13 años; para comprar, mayor de edad o contar con autorización de un adulto responsable.</li>
              <li>Sos responsable de cuidar tu contraseña y el acceso a tu email o a tu cuenta de Google.</li>
              <li>Podemos suspender cuentas usadas para fraude, reventa no autorizada o para perjudicar a otras personas.</li>
            </ul>
          ),
        },
        {
          id: 'compra',
          title: 'Compra de entradas',
          body: (
            <ul>
              <li>Al precio de la entrada se suma un cargo por servicio de Lintick (10%, salvo que se indique otro). Antes de pagar ves el detalle: precio, cargo por servicio y total.</li>
              <li>Al iniciar la compra, las entradas quedan reservadas por un tiempo limitado; si no se completa el pago, se liberan.</li>
              <li>Los pagos se procesan con Mercado Pago. La entrada se emite cuando Mercado Pago confirma el pago.</li>
            </ul>
          ),
        },
        {
          id: 'entradas',
          title: 'Tus entradas y el ingreso',
          body: (
            <ul>
              <li>Cada entrada tiene un QR firmado y único que se valida una sola vez en la puerta. No compartas su imagen: quien lo muestre primero, entra.</li>
              <li>La productora puede pedir DNI para verificar al titular y fijar condiciones de ingreso (edad mínima, objetos permitidos, horarios).</li>
              <li>Las entradas compradas fuera de Lintick o reenviadas por terceros pueden no ser válidas.</li>
            </ul>
          ),
        },
        {
          id: 'devoluciones',
          title: 'Cambios, cancelaciones y devoluciones',
          body: (
            <>
              <p>
                Si un evento se cancela, la productora es responsable de devolver el valor de las entradas. Si se reprograma, la entrada sigue valiendo para la nueva fecha salvo que la productora
                ofrezca otra opción.
              </p>
              <p>
                Tenés derecho a revocar la compra dentro de los 10 días corridos conforme al art. 34 de la Ley 24.240 de Defensa del Consumidor, en los casos en que corresponda según la normativa
                vigente. Para pedirlo, escribinos por WhatsApp al{' '}
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  {SUPPORT_WHATSAPP}
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: 'productoras',
          title: 'Productoras',
          body: (
            <ul>
              <li>Las productoras cobran sus ventas en su propia cuenta de Mercado Pago, por el precio completo de cada entrada. El cargo por servicio lo paga el comprador y es el ingreso de Lintick.</li>
              <li>Son responsables de la información de sus eventos, del cumplimiento de habilitaciones y de las devoluciones cuando correspondan.</li>
              <li>Sólo pueden usar los datos de sus asistentes para gestionar sus eventos.</li>
            </ul>
          ),
        },
        {
          id: 'responsabilidad',
          title: 'Responsabilidad',
          body: (
            <p>
              Lintick hace lo posible para que la plataforma funcione siempre, pero puede haber interrupciones. Lintick no es responsable por la realización, calidad o cambios de los eventos, que
              dependen de cada productora.
            </p>
          ),
        },
        {
          id: 'cambios',
          title: 'Cambios a estos términos',
          body: <p>Si cambiamos estos términos, la nueva versión se publica en esta página con su fecha. Para compras ya hechas, rigen los términos vigentes al momento de la compra.</p>,
        },
        {
          id: 'ley',
          title: 'Ley aplicable',
          body: <p>Estos términos se rigen por las leyes de la República Argentina.</p>,
        },
      ]}
    />
  );
}
