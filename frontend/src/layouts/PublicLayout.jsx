import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';

const PublicLayout = () => {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="w-full flex-1 pt-[70px]">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default PublicLayout;
