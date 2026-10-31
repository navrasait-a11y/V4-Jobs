import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../assets/freejobwala-logo.png';

/** The official Freejobwala logo. `onDark` adds a white plate so it stays legible on ink backgrounds. */
const Logo = ({ height = 36, onDark = false, className = '', onClick }) => {
  const { pathname } = useLocation();
  const handleClick = (e) => {
    if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
    onClick?.(e);
  };
  return (
    <Link to="/" onClick={handleClick} aria-label="Freejobwala home" className={`inline-flex min-w-0 shrink ${onDark ? 'rounded-xl bg-white px-3 py-2' : ''} ${className}`}>
      <img src={logo} alt="" width={Math.round((height * 504) / 107)} height={height} style={{ height, width: 'auto', maxWidth: '100%' }} />
    </Link>
  );
};

export default Logo;
