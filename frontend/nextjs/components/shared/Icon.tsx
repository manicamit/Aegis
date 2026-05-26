interface IconProps {
  name: string;
  size?: number;
  [key: string]: unknown;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
  switch (name) {
    case 'shield':       return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/></svg>;
    case 'home':         return <svg {...p}><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v9h14v-9"/></svg>;
    case 'chart':        return <svg {...p}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-3"/><path d="M12 15V8"/><path d="M16 15v-5"/></svg>;
    case 'user':         return <svg {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 4-5 7-5s6 1.5 7 5"/></svg>;
    case 'filter':       return <svg {...p}><path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/></svg>;
    case 'search':       return <svg {...p}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>;
    case 'bell':         return <svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 21h4"/></svg>;
    case 'cog':          return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 14.5l1.6.9-2 3.4-1.8-.6a7 7 0 0 1-1.8 1l-.4 1.8h-4l-.4-1.8a7 7 0 0 1-1.8-1l-1.8.6-2-3.4 1.6-.9a7 7 0 0 1 0-2l-1.6-.9 2-3.4 1.8.6a7 7 0 0 1 1.8-1L10 5h4l.4 1.8a7 7 0 0 1 1.8 1l1.8-.6 2 3.4-1.6.9a7 7 0 0 1 0 2z"/></svg>;
    case 'case':         return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>;
    case 'flag':         return <svg {...p}><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>;
    case 'exit':         return <svg {...p}><path d="M10 20H5V4h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/></svg>;
    case 'alert':        return <svg {...p}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".8" fill="currentColor"/></svg>;
    case 'graph':        return <svg {...p}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l3 9M16 7l-3 9M8 6h8"/></svg>;
    case 'pin':          return <svg {...p}><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>;
    case 'device':       return <svg {...p}><rect x="2.5" y="5" width="15" height="11" rx="1.6"/><path d="M9 19h6M11 16v3"/><path d="M19 11h2.5v8H19"/></svg>;
    case 'mail':         return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/></svg>;
    case 'chat':         return <svg {...p}><path d="M21 12a8 8 0 1 1-3.2-6.4L21 5l-.6 3.4A8 8 0 0 1 21 12z"/></svg>;
    case 'card':         return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></svg>;
    case 'chev-l':       return <svg {...p}><path d="M14 6l-6 6 6 6"/></svg>;
    case 'chev-r':       return <svg {...p}><path d="M10 6l6 6-6 6"/></svg>;
    case 'chev-d':       return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chev-u':       return <svg {...p}><path d="M6 15l6-6 6 6"/></svg>;
    case 'plus':         return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'x':            return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'check':        return <svg {...p}><path d="M5 12l5 5 9-11"/></svg>;
    case 'dots':         return <svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>;
    case 'thumb-up':     return <svg {...p}><path d="M7 22V11l5-8c1.2 0 2 1 2 2v5h5a2 2 0 0 1 2 2l-1.5 8a2 2 0 0 1-2 2H7z"/><path d="M7 11H3v11h4"/></svg>;
    case 'thumb-down':   return <svg {...p}><path d="M17 2v11l-5 8c-1.2 0-2-1-2-2v-5H5a2 2 0 0 1-2-2l1.5-8a2 2 0 0 1 2-2H17z"/><path d="M17 13h4V2h-4"/></svg>;
    case 'dollar':       return <svg {...p}><path d="M12 3v18"/><path d="M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8"/></svg>;
    case 'print':        return <svg {...p}><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="9" rx="1.6"/><rect x="7" y="14" width="10" height="6" rx="1"/></svg>;
    case 'export':       return <svg {...p}><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/></svg>;
    case 'circle-check': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>;
    case 'spark':        return <svg {...p}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/></svg>;
    case 'activity':     return <svg {...p}><polyline points="22 12 18 12 15 20 9 4 6 12 2 12"/></svg>;
    case 'layers':       return <svg {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>;
  }
  return null;
}
