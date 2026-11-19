import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Advertise from './pages/Advertise';
import AdNew from './pages/AdNew';
import AdRequestPage from './pages/AdRequestPage';
import AdMine from './pages/AdMine';
import AdSignup from './pages/AdSignup';
import AdsQueue from './admin/AdsQueue';
import AdReview from './admin/AdReview';
import AdPlans from './admin/AdPlans';
import AdAnalytics from './admin/AdAnalytics';

export const memberRoutes: RouteObject[] = [
  { path: 'advertise', element: <Advertise /> },
  { path: 'advertise/new', element: <AdNew /> },
  { path: 'advertise/mine', element: <AdMine /> },
  { path: 'advertise/requests/:id', element: <AdRequestPage /> },
];

export const publicRoutes: RouteObject[] = [{ path: 'advertise/signup', element: <AdSignup /> }];

const review = ['ads.manage', 'ads.approve'];
export const adminRoutes: RouteObject[] = [
  { path: 'ads', element: <RequirePerm perm={review}><AdsQueue /></RequirePerm> },
  { path: 'ads/plans', element: <RequirePerm perm="ads.manage"><AdPlans /></RequirePerm> },
  { path: 'ads/analytics', element: <RequirePerm perm="ads.manage"><AdAnalytics /></RequirePerm> },
  { path: 'ads/:requestId', element: <RequirePerm perm={review}><AdReview /></RequirePerm> },
];
