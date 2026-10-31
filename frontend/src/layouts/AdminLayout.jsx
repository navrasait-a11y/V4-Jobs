import React from 'react';
import PanelLayout from '../components/shell/PanelLayout';
import { adminNav } from '../config/nav';

const profileMenu = [
  { label: 'My Profile', to: '/admin/profile', icon: 'account_circle' },
  { label: 'Settings', to: '/admin/settings', icon: 'settings' },
];

const AdminLayout = () => <PanelLayout nav={adminNav} role="admin" profileMenu={profileMenu} subtitle="Administrator" messagesPath="/admin/support-chat" />;

export default AdminLayout;
