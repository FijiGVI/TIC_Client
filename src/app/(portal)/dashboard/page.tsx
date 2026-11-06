'use client';

import { AdminAnalytics } from '@/components/AdminAnalytics';
import { RequesterDashboard } from '@/components/RequesterDashboard';
import { useAuth } from '@/features/auth/AuthProvider';

export default function DashboardPage() {
  const { user } = useAuth();
  const isBackOffice = Boolean(user?.permissions.includes('requests.read.all'));
  return isBackOffice ? <AdminAnalytics /> : <RequesterDashboard />;
}

