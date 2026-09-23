
interface GridLayoutPreference {
  userId: string;
  layoutId: string;
  layoutName: string;
  aspectRatio: string;
}

let userGridPreferences: GridLayoutPreference[] = [];

export const setUserGridLayout = async (userId: string, layoutId: string, layoutName: string, aspectRatio: string): Promise<void> => {
  const existingIndex = userGridPreferences.findIndex(pref => pref.userId === userId);
  const newPreference: GridLayoutPreference = { userId, layoutId, layoutName, aspectRatio };

  if (existingIndex >= 0) {
    userGridPreferences[existingIndex] = newPreference;
  } else {
    userGridPreferences.push(newPreference);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('scope_grid_preferences', JSON.stringify(userGridPreferences));
  }
  // C1c — the profiles.grid_layout mirror is retired. The grid-layout page's canonical writes
  // (setSharedAspect + setMobileCount) are the source of truth; this no longer writes the mirror.
};

export const getUserGridLayout = (userId: string): GridLayoutPreference | null => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('scope_grid_preferences');
    if (saved) {
      try {
        userGridPreferences = JSON.parse(saved);
      } catch (error) {
        console.error('Error parsing grid preferences:', error);
      }
    }
  }

  return userGridPreferences.find(pref => pref.userId === userId) || null;
};

export const getDefaultGridLayout = () => ({
  layoutId: 'single',
  layoutName: 'Single',
  aspectRatio: '1:1'
});
