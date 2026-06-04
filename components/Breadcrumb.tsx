import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[12px] text-slate-400 mb-6 flex-wrap">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-300">›</span>}
            {isLast || !crumb.href ? (
              <span className={isLast ? 'text-slate-600 font-medium' : 'text-slate-400'}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-slate-700 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
