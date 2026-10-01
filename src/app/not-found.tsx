import Link from 'next/link';
export default function NotFound() {
  return <main style={{ padding: 32, maxWidth: 520, margin: '10vh auto' }}><h1>Stránka nenalezena</h1><p>Tato adresa v aplikaci neexistuje.</p><Link className="btn btn-primary" href="/">Zpět na mapu</Link></main>;
}
