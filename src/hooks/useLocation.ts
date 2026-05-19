import { useContext } from 'react';
import { LocationContext } from '../providers/LocationProvider';

export function useLocation() {
  const context = useContext(LocationContext);

  if (!context) {
    throw new Error('useLocation must be used inside LocationProvider');
  }

  return context;
}
