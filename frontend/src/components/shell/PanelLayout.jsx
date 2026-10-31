import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Logo from '../common/Logo';
import { Avatar } from '../ui/data';
import { Icon } from '../ui/feedback';
import useAuth, { useCan } from '../../hooks/useAuth';
import { notificationLink, useBadges, useRealtimeSession } from '../../hooks/useRealtime';
import { notificationApi } from '../../services';
import { timeAgo, titleCase } from '../../utils/format';

const NavItem = ({ item, badge, onNavigate, collapsed }) => (
  <NavLink
    to={item.to}
    onClick={onNavigate}
    title={collapsed ? item.label : undefined}
    aria-label={collapsed ? item.label : undefined}
    className={({ isActive }) => clsx('relative flex items-center rounded-md text-sm font-medium transition-colors', collapsed ? 'h-10 w-10 justify-center' : 'justify-between gap-3 px-2.5 py-2', isActive ? 'bg-brand-blue-tint text-brand-blue' : 'text-brand-gray hover:bg-brand-tint hover:text-brand-dark')}
  >
    <span className="flex min-w-0 items-center gap-2.5">
      <Icon name={item.icon} size={19} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </span>
    {badge > 0 && (collapsed ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-orange" /> : <span className="rounded bg-brand-orange px-1.5 py-0.5 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>)}
  </NavLink>
);

const SidebarBody = ({ nav, role, header, footer, chatUnread, onNavigate, collapsed }) => {
  const can = useCan();
  return (
    <>
      {!collapsed && header}
      <nav className={clsx('flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-3', collapsed ? 'px-3.5' : 'px-3')} aria-label="Main">
        {nav.map((group, i) => {
          const items = group.items.filter((it) => role !== 'employer' || !it.perm || can(...it.perm));
          if (!items.length) return null;
          return (
            <div key={group.title || i}>
              {group.title && (collapsed ? <hr className="mb-3 border-brand-border" /> : <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-gray-muted">{group.title}</p>)}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavItem key={item.to} item={item} collapsed={collapsed} badge={item.badge === 'chat' ? chatUnread : 0} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {!collapsed && footer}
    </>
  );
};

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return { open, setOpen, ref };
}

const NotificationBell = ({ allPath, notifications, unread, role }) => {
  const { open, setOpen, ref } = useDropdown();
  const navigate = useNavigate();
  const client = useQueryClient();
  const go = async (n) => {
    setOpen(false);
    if (!n.readAt) {
      await notificationApi.read([n._id]).catch(() => {});
      client.invalidateQueries({ queryKey: ['notifications'] });
    }
    const link = notificationLink(n, role);
    if (link) navigate(link);
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label={`Notifications, ${unread} unread`} className="relative rounded-full p-2 text-brand-gray hover:bg-brand-tint hover:text-brand-dark">
        <Icon name="notifications" size={22} />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] surface shadow-2xl pop-in">
          <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
            <p className="text-sm font-bold text-brand-dark">Notifications</p>
            {allPath && (
              <Link to={allPath} onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-blue hover:underline">
                View all
              </Link>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!notifications.length && <p className="px-4 py-8 text-center text-sm text-brand-gray-muted">You are all caught up</p>}
            {notifications.map((n) => (
              <button key={n._id} onClick={() => go(n)} className={clsx('block w-full border-b border-brand-border/60 px-4 py-2.5 text-left last:border-0 hover:bg-brand-tint', !n.readAt && 'bg-brand-blue-tint/50')}>
                <p className="text-xs font-bold text-brand-dark">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-brand-gray">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-brand-gray-muted">{timeAgo(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProfileMenu = ({ user, subtitle, menu }) => {
  const { open, setOpen, ref } = useDropdown();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await logout();
    navigate('/');
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-brand-tint">
        <Avatar name={user.fullName} src={user.avatar?.url} size={32} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-brand-dark">{user.fullName}</span>
          <span className="block max-w-[140px] truncate text-xs text-brand-gray-muted">{subtitle}</span>
        </span>
        <Icon name="expand_more" size={18} className="hidden text-brand-gray-muted sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 surface py-2 shadow-2xl animate-fade-up">
          {menu.map((m) => (
            <Link key={m.to} to={m.to} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm text-brand-gray hover:bg-brand-tint">
              <Icon name={m.icon} size={18} /> {m.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-brand-border pt-1">
            <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-brand-red hover:bg-brand-red-tint">
              <Icon name="logout" size={18} /> Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Shared shell for the candidate, employer and admin panels: fixed sidebar on desktop,
 * drawer on phones, live notification and chat badges in the topbar.
 */
const PanelLayout = ({ nav, role, sidebarHeader, sidebarFooter, topLinks = [], topExtra, banner, profileMenu, subtitle, messagesPath, notificationsPath }) => {
  const { user, impersonatedBy, logout } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('fjw_sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('fjw_sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* storage blocked */
      }
      return !c;
    });
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, unread, chatUnread } = useBadges();
  useRealtimeSession();

  useEffect(() => {
    setDrawer(false);
    document.getElementById('panel-main')?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-brand-tint">
      <aside className={clsx('hidden shrink-0 flex-col border-r border-brand-border bg-white transition-[width] duration-150 lg:flex', collapsed ? 'w-[68px]' : 'w-60')}>
        <SidebarBody nav={nav} role={role} header={sidebarHeader} footer={sidebarFooter} chatUnread={chatUnread} collapsed={collapsed} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-brand-border p-4">
              <Logo height={26} onClick={() => setDrawer(false)} />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="text-brand-gray">
                <Icon name="close" />
              </button>
            </div>
            <SidebarBody nav={nav} role={role} header={sidebarHeader} footer={sidebarFooter} chatUnread={chatUnread} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {impersonatedBy && (
          <div className="flex items-center justify-between gap-3 bg-brand-orange px-4 py-1.5 text-xs font-semibold text-white">
            <span>You are viewing this account as an admin</span>
            <button
              className="underline"
              onClick={async () => {
                await logout();
                navigate('/admin/login');
              }}
            >
              End session
            </button>
          </div>
        )}
        <header className="z-30 flex h-14 shrink-0 items-center gap-2.5 border-b border-brand-border bg-white px-3 lg:px-4">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-md p-1.5 text-brand-dark hover:bg-brand-tint lg:hidden">
            <Icon name="menu" size={24} />
          </button>
          <button onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden rounded-md p-1.5 text-brand-gray hover:bg-brand-tint lg:block">
            <Icon name={collapsed ? 'left_panel_open' : 'left_panel_close'} size={22} />
          </button>
          <Logo height={24} />
          <nav className="ml-4 hidden items-center gap-5 lg:flex">
            {topLinks.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => clsx('text-sm font-medium', isActive ? 'text-brand-blue' : 'text-brand-gray hover:text-brand-dark')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
            {topExtra}
            <NotificationBell allPath={notificationsPath} notifications={notifications} unread={unread} role={role} />
            {messagesPath && (
              <Link to={messagesPath} aria-label={`Messages, ${chatUnread} unread`} className="relative hidden rounded-full p-2 min-[400px]:block text-brand-gray hover:bg-brand-tint hover:text-brand-dark">
                <Icon name="chat_bubble" size={22} />
                {chatUnread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">{chatUnread > 9 ? '9+' : chatUnread}</span>}
              </Link>
            )}
            <ProfileMenu user={user} subtitle={subtitle || titleCase(user.role)} menu={profileMenu} />
          </div>
        </header>
        {banner}
        <main id="panel-main" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default PanelLayout;
