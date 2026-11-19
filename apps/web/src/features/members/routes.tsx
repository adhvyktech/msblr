import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Directory from './pages/Directory';
import Profile from './pages/Profile';
import AdminMembers from './pages/AdminMembers';
import AdminFamily from './pages/AdminFamily';
import ImportPage from './pages/ImportPage';

const VIEW = ['members.view_private', 'members.edit'];

export const memberRoutes: RouteObject[] = [
  { path: 'members', element: <Directory /> },
  { path: 'members/:familyId', element: <Profile /> },
];
export const adminRoutes: RouteObject[] = [
  { path: 'members', element: <RequirePerm perm={VIEW}><AdminMembers /></RequirePerm> },
  { path: 'members/import', element: <RequirePerm perm="members.edit"><ImportPage /></RequirePerm> },
  { path: 'members/:familyId', element: <RequirePerm perm={VIEW}><AdminFamily /></RequirePerm> },
];
