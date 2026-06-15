import { useAuth } from '../contexts/AuthContext';

export type Role = 'admin' | 'developer' | 'viewer';

export function useRole() {
  const { user } = useAuth();
  const role = (user?.role || 'viewer') as Role;

  const isAdmin     = role === 'admin';
  const isDeveloper = role === 'admin' || role === 'developer';
  const isViewer    = role === 'viewer';

  return {
    role,
    isAdmin,
    isDeveloper,
    isViewer,
    
    can: {
      createDeployment: isDeveloper,
      startStopRestart: isDeveloper,
      deleteDeployment: isAdmin,
      viewDeployments:  true,
      viewLogs:         true,
      viewMetrics:      true,
      viewContainers:   true,
      manageContainers: isDeveloper,
      removeContainer:  isAdmin,
      cloudDeploy:      isDeveloper,
      deleteCloud:      isAdmin,
      connectGitHub:    isDeveloper,
      disconnectGitHub: isAdmin,
      manageTeam:       isAdmin,
      manageSettings:   isAdmin,
      inviteMembers:    isAdmin,
      useAI:            isDeveloper,
    },
  };
}
