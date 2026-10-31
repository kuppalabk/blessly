export function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function Avatar({ name, id, small = false }: { name: string; id: string; small?: boolean }) {
  return <span className={`avatar av-${hue(id)} ${small ? 'avatar-sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}
