import React from 'react';
import { Outlet } from 'react-router-dom';
import RouteSuspense from '../components/common/RouteSuspense';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';

const PublicLayout = () => {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="w-full flex-1 pt-[70px]">
        <RouteSuspense className="min-h-[60vh]">
          <Outlet />
        </RouteSuspense>
      </main>
      <Footer />
    </div>
  );
};

export default PublicLayout;
