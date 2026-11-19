import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import ReceiptView from './pages/ReceiptView';
import Register from './pages/Register';

export const memberRoutes: RouteObject[] = [{ path: 'me/receipts/:id', element: <ReceiptView /> }];

export const adminRoutes: RouteObject[] = [{ path: 'receipts', element: <RequirePerm perm="receipts.view"><Register /></RequirePerm> }];
