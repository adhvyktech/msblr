import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Contacts from './pages/Contacts';
import AdminContacts from './pages/AdminContacts';

export const memberRoutes: RouteObject[] = [{ path: 'contacts', element: <Contacts /> }];
export const adminRoutes: RouteObject[] = [{ path: 'contacts', element: <RequirePerm perm="contacts.edit"><AdminContacts /></RequirePerm> }];
