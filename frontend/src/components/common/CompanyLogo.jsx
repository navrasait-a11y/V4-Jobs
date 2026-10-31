import React from 'react';
import { Avatar } from '../ui/data';

/** Employer logo from the API, or initials when none was uploaded. */
const CompanyLogo = ({ name, src, size = 44, className = '' }) => <Avatar name={name} src={src} size={size} square className={className} />;

export default CompanyLogo;
