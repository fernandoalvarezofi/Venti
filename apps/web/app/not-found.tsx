import { Mascot } from '@/components/mascot';
import { EmptyState } from '@/components/states';

export default function NotFound() {
  return (
    <div className="px-4 pt-12">
      <Mascot pose="wave" say="¡Ups!" size={170} className="mx-auto mb-2" priority />
      <EmptyState mascot={false} title="Esta página no existe" body="Puede que el evento se haya despublicado o que el enlace esté incompleto." action={{ href: '/eventos', label: 'Ver eventos' }} />
    </div>
  );
}
