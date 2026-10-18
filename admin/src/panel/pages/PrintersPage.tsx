import React from 'react';
import { PrintersView } from '../components/PrintersView';

export const PrintersPage: React.FC = () => {
  return (
    <div className="admin-page-container">
      <PrintersView />
    </div>
  );
};

export default PrintersPage;
