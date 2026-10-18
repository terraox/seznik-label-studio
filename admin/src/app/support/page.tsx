import { redirect } from 'next/navigation';

/** Support portal from the analytics panel is not part of this desk. */
export default function SupportPage() {
  redirect('/overview');
}
