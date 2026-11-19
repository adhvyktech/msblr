import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Subscription from './pages/Subscription';
import PayUpi from './pages/PayUpi';
import Proof from './pages/Proof';
import MyPayments from './pages/MyPayments';
import PaymentDesk from './pages/PaymentDesk';
import SubscriptionsAdmin from './pages/SubscriptionsAdmin';

export const memberRoutes: RouteObject[] = [
  { path: 'me/subscription', element: <Subscription /> },
  { path: 'me/subscription/pay', element: <PayUpi /> },
  { path: 'me/subscription/proof', element: <Proof /> },
  { path: 'me/payments', element: <MyPayments /> },
];

export const adminRoutes: RouteObject[] = [
  { path: 'payments', element: <RequirePerm perm="payments.verify"><PaymentDesk /></RequirePerm> },
  { path: 'subscriptions', element: <RequirePerm perm="payments.verify"><SubscriptionsAdmin /></RequirePerm> },
];
