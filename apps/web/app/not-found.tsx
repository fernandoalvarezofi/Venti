import { EmptyState } from '@/components/states';

export default function NotFound() {
  return (
    <div className="px-4 pt-20">
      <EmptyState title="Esta página no existe" body="Puede que el evento se haya despublicado o que el enlace esté incompleto." action={{ href: '/eventos', label: 'Ver eventos' }} />
    </div>
  );
}
