import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, Button, Container,
  Drawer, IconButton, useMediaQuery, useTheme, Tooltip, Avatar
} from '@mui/material';
import { keyframes } from '@mui/material/styles';
import {
  DashboardRounded, PeopleRounded, BusinessRounded,
  ReceiptLongRounded, AccountBalanceWalletRounded,
  PaymentsRounded, AssessmentRounded, AccountBalanceRounded,
  CancelRounded, GroupsRounded, MenuRounded, LogoutRounded,
  MenuBookRounded, PersonSearchRounded, FlightTakeoffRounded
} from '@mui/icons-material';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

// ─── ANIMATION STYLES ───

// Clouds moving Left to Right
const drift = keyframes`
  from { transform: translateX(-220px); }
  to   { transform: translateX(calc(100vw + 220px)); }
`;

// Plane flying Left to Right. 
// Fades out at 75% across the screen so it never touches the profile info.
const flyAcross = keyframes`
  0%   { transform: translate(0, 0) rotate(90deg); opacity: 0; }
  5%   { opacity: 1; }
  60%  { opacity: 1; }
  75%  { transform: translate(calc(100vw - 400px), 0) rotate(90deg); opacity: 0; }
  100% { transform: translate(calc(100vw - 400px), 0) rotate(90deg); opacity: 0; }
`;

// The exact Airplane SVG
const AirplaneSvg = ({ size = 38 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    style={{ display: 'block', filter: 'drop-shadow(0 5px 6px rgba(13,71,161,0.35))' }}
  >
    <path d="M36.5 22 L61 40 L61 44.5 L36.5 36.5 Z" fill="#e3f2fd" stroke="#0d47a1" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M27.5 22 L3 40 L3 44.5 L27.5 36.5 Z" fill="#e3f2fd" stroke="#0d47a1" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M35.5 50 L46 58 L46 60.5 L35 56.5 Z" fill="#e3f2fd" stroke="#0d47a1" strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M28.5 50 L18 58 L18 60.5 L29 56.5 Z" fill="#e3f2fd" stroke="#0d47a1" strokeWidth="1.1" strokeLinejoin="round" />
    <ellipse cx="46" cy="30" rx="2.4" ry="5" fill="#90caf9" stroke="#0d47a1" strokeWidth="1" />
    <ellipse cx="18" cy="30" rx="2.4" ry="5" fill="#90caf9" stroke="#0d47a1" strokeWidth="1" />
    <path
      d="M32 2 C35 2 36.5 8 36.5 16 L36.5 50 C36.5 55 34 60 32 62 C30 60 27.5 55 27.5 50 L27.5 16 C27.5 8 29 2 32 2 Z"
      fill="#ffffff" stroke="#0d47a1" strokeWidth="1.2" strokeLinejoin="round"
    />
    <path d="M29.6 10 Q32 7.2 34.4 10 L33.8 12 Q32 10.6 30.2 12 Z" fill="#1976d2" />
    <g fill="#90caf9">
      <rect x="30.2" y="17" width="1.3" height="1.6" rx="0.4" />
      <rect x="32.5" y="17" width="1.3" height="1.6" rx="0.4" />
      <rect x="30.2" y="21" width="1.3" height="1.6" rx="0.4" />
      <rect x="32.5" y="21" width="1.3" height="1.6" rx="0.4" />
      <rect x="30.2" y="39" width="1.3" height="1.6" rx="0.4" />
      <rect x="32.5" y="39" width="1.3" height="1.6" rx="0.4" />
      <rect x="30.2" y="43" width="1.3" height="1.6" rx="0.4" />
      <rect x="32.5" y="43" width="1.3" height="1.6" rx="0.4" />
    </g>
  </svg>
);

// Dark slate-blue clouds
const cloudSx = (top, w, duration, delay, opacity) => ({
  position: 'absolute',
  top,
  left: 0,
  width: w,
  height: w * 0.28,
  borderRadius: 99,
  bgcolor: `rgba(130, 150, 170, ${opacity})`,
  filter: 'blur(2px)',
  animation: `${drift} ${duration}s linear ${delay}s infinite`,
  '&::before, &::after': {
    content: '""',
    position: 'absolute',
    bottom: '40%',
    borderRadius: '50%',
    bgcolor: `rgba(130, 150, 170, ${opacity})`
  },
  '&::before': { width: w * 0.38, height: w * 0.38, left: '16%' },
  '&::after': { width: w * 0.28, height: w * 0.28, left: '46%' }
});

const HeaderSky = ({ startX, startY }) => (
  <Box
    aria-hidden
    sx={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
      maskImage: 'linear-gradient(to right, black 40%, transparent 75%)',
      WebkitMaskImage: 'linear-gradient(to right, black 40%, transparent 75%)',
      '@media (prefers-reduced-motion: reduce)': { display: 'none' }
    }}
  >
    {/* 15 drifting clouds */}
    <Box sx={cloudSx('5%', 140, 55, -30, 0.25)} />
    <Box sx={cloudSx('10%', 120, 45, -20, 0.30)} />
    <Box sx={cloudSx('15%', 100, 40, -5, 0.35)} />
    <Box sx={cloudSx('20%', 110, 50, -50, 0.25)} />
    <Box sx={cloudSx('28%', 80, 35, -15, 0.30)} />
    <Box sx={cloudSx('35%', 160, 70, -60, 0.20)} />
    <Box sx={cloudSx('42%', 70, 25, -8, 0.40)} />
    <Box sx={cloudSx('50%', 130, 55, -32, 0.25)} />
    <Box sx={cloudSx('58%', 90, 40, -25, 0.35)} />
    <Box sx={cloudSx('65%', 80, 35, -15, 0.25)} />
    <Box sx={cloudSx('72%', 150, 60, -45, 0.20)} />
    <Box sx={cloudSx('80%', 110, 45, -10, 0.30)} />
    <Box sx={cloudSx('88%', 100, 40, -35, 0.25)} />
    <Box sx={cloudSx('95%', 170, 75, -55, 0.20)} />
    <Box sx={cloudSx('2%', 90, 35, -12, 0.30)} />

    {/* The Airplane */}
    {startX > 0 && (
      <Box
        sx={{
          position: 'absolute',
          top: `${startY}px`,
          left: `${startX}px`,
          display: 'flex',
          alignItems: 'center',
          animation: `${flyAcross} 35s linear 1s infinite`,
        }}
      >
        <AirplaneSvg size={38} />
      </Box>
    )}
  </Box>
);
// ─────────────────────────────────────

// LOGICALLY GROUPED AND ORDERED MENU ITEMS
const items = [
  // 1. Overview
  { name: 'Dashboard', path: '/', icon: DashboardRounded, color: '#1976d2' },

  // 2. Master Data (People & Partners)
  { name: 'User Management', path: '/user-management', icon: PeopleRounded, color: '#1685ff' },
  { name: 'Supplier Management', path: '/supplier-management', icon: BusinessRounded, color: '#00897b' },
  { name: 'Staff Management', path: '/staff-management', icon: GroupsRounded, color: '#d97706' },

  // 3. Transactions (Invoicing & Collections)
  { name: 'Invoice', path: '/invoice', icon: ReceiptLongRounded, color: '#7357e8' },
  { name: 'Receipt', path: '/receipt', icon: PaymentsRounded, color: '#159c69' },
  { name: 'Cancellation', path: '/cancellation', icon: CancelRounded, color: '#e53935' },

  // 4. Payments (Outflows & Banking)
  { name: 'Payment Voucher', path: '/payment-voucher', icon: AccountBalanceRounded, color: '#0b8fba' },
  { name: 'Accounts', path: '/bank-ledger', icon: AccountBalanceRounded, color: '#3478c8' },

  // 5. Reports & Ledgers (Analysis)
  { name: 'Outstanding', path: '/outstanding', icon: AccountBalanceWalletRounded, color: '#e68a00' },
  { name: 'Profit Ledger', path: '/profit-ledger', icon: AssessmentRounded, color: '#a044c7' },
  { name: 'Customer Ledger', path: '/customer-ledger', icon: PersonSearchRounded, color: '#6c63d9' },
  { name: 'Customer Report', path: '/customer-report', icon: AssessmentRounded, color: '#2e7d32' },
  { name: 'Staff Ledger', path: '/staff-ledger', icon: MenuBookRounded, color: '#00838f' },
];

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);

  const adminTextRef = useRef(null);
  const [planeStart, setPlaneStart] = useState({ x: -100, y: 36 });

  useEffect(() => {
    const measureText = () => {
      if (adminTextRef.current) {
        const rect = adminTextRef.current.getBoundingClientRect();
        const appBarRect = adminTextRef.current.closest('.MuiAppBar-root').getBoundingClientRect();
        
        setPlaneStart({
          x: rect.right,
          y: rect.top - appBarRect.top + (rect.height / 2) - 19 
        });
      }
    };

    const timer = setTimeout(measureText, 100);
    window.addEventListener('resize', measureText);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureText);
    };
  }, []);

  const user = auth.currentUser;
  const displayName = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Admin User');
  const email = user?.email || 'admin@travelwings.com';
  const initials = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const goTo = (path) => {
    navigate(path);
    setOpen(false);
  };

  const sidebar = (
    <Box sx={{
      width: mobile ? 270 : 248,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: '#fff',
      overflowY: 'auto',
      borderRight: '1px solid #e8edf5'
    }}>
      <Box sx={{
        p: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderBottom: '1px solid #edf1f7'
      }}>
        <Box sx={{
          width: 42, height: 42, borderRadius: '14px',
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg,#1685ff,#5145cd)',
          color: '#fff'
        }}>
          <FlightTakeoffRounded />
        </Box>
        <Box>
          <Typography fontWeight={800} color="#000000">Travel Wings</Typography>
          <Typography variant="caption" color="#333333" fontWeight={500}>Administration</Typography>
        </Box>
      </Box>

      <Box sx={{ px: 1.5, py: 2, flexGrow: 1 }}>
        <Typography sx={{
          px: 1.5, mb: 1.5, fontSize: 11,
          fontWeight: 800, letterSpacing: 1.2,
          color: '#000000'
        }}>
          MAIN MENU
        </Typography>

        {items.map((item) => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
          const Icon = item.icon;

          return (
            <Button
              key={item.path}
              fullWidth
              onClick={() => goTo(item.path)}
              startIcon={
                <Icon sx={{
                  color: active ? item.color : '#3b4758',
                  fontSize: 21
                }} />
              }
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontSize: 13.5,
                fontWeight: active ? 750 : 600,
                color: active ? item.color : '#000000',
                px: 1.5,
                py: 1.25,
                mb: 0.6,
                borderRadius: '12px',
                borderLeft: active ? `4px solid ${item.color}` : '4px solid transparent',
                bgcolor: active ? `${item.color}12` : 'transparent',
                '& .MuiButton-startIcon': { mr: 1.5 },
                '&:hover': {
                  bgcolor: `${item.color}12`,
                  color: item.color
                }
              }}
            >
              {item.name}
            </Button>
          );
        })}
      </Box>

      <Box sx={{
        mx: 2, mb: 2, p: 2, borderRadius: 3,
        background: 'linear-gradient(135deg,#e5f2ff,#f0edff)',
        textAlign: 'center'
      }}>
        <FlightTakeoffRounded sx={{ color: '#3478e5', fontSize: 32 }} />
        <Typography variant="body2" fontWeight={800} color="#000000">
          Travel Wings Admin
        </Typography>
        <Typography variant="caption" color="#333333" fontWeight={500}>
          Manage your business with ease
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      bgcolor: '#f4f7fc'
    }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          overflow: 'hidden', 
          background: 'linear-gradient(105deg,#0878ed 0%,#4265f5 58%,#5140cc 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.18)'
        }}
      >
        <HeaderSky startX={planeStart.x} startY={planeStart.y} />

        <Toolbar sx={{ position: 'relative', zIndex: 1, minHeight: '72px !important', px: { xs: 1.5, md: 3 } }}>
          {mobile && (
            <IconButton color="inherit" onClick={() => setOpen(true)} sx={{ mr: 1 }}>
              <MenuRounded />
            </IconButton>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1 }}>
            <Box sx={{
              width: 39, height: 39, borderRadius: '12px',
              bgcolor: 'rgba(255,255,255,0.17)',
              display: 'grid', placeItems: 'center'
            }}>
              <FlightTakeoffRounded sx={{ color: '#fff', fontSize: 25 }} />
            </Box>
            <Typography sx={{
              fontWeight: 800,
              fontSize: { xs: 16, sm: 20 },
              letterSpacing: '-0.3px',
              color: '#ffffff'
            }}>
              Travel Wings <span ref={adminTextRef}>Admin</span>
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, color: '#fff' }}>
                  {displayName}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                  {email}
                </Typography>
              </Box>
              <Avatar 
                src={user?.photoURL} 
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.25)', 
                  color: '#fff', 
                  fontWeight: 'bold',
                  width: 42,
                  height: 42,
                  border: '2px solid rgba(255,255,255,0.5)'
                }}
              >
                {initials}
              </Avatar>
            </Box>

            <Tooltip title="Logout">
              <Button
                onClick={handleLogout}
                color="inherit"
                startIcon={<LogoutRounded />}
                sx={{
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  px: { xs: 1, sm: 2 },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                }}
              >
                Logout
              </Button>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flexGrow: 1, minWidth: 0 }}>
        {!mobile && (
          <Box sx={{
            width: 248,
            flexShrink: 0,
            alignSelf: 'stretch'
          }}>
            {sidebar}
          </Box>
        )}

        <Drawer
          open={mobile && open}
          onClose={() => setOpen(false)}
          sx={{ '& .MuiDrawer-paper': { border: 0 } }}
        >
          {sidebar}
        </Drawer>

        <Box component="main" sx={{
          flexGrow: 1,
          minWidth: 0,
          p: { xs: 1.5, sm: 2.5, md: 3 },
          overflowX: 'auto'
        }}>
          <Container maxWidth={false} disableGutters>
            <Box sx={{
              minHeight: 'calc(100vh - 130px)',
              bgcolor: '#fff',
              border: '1px solid #e8edf5',
              borderRadius: { xs: 2, md: 3 },
              boxShadow: '0 4px 20px rgba(36,67,120,0.045)',
              p: { xs: 1.5, sm: 2.5, md: 3 }
            }}>
              <Outlet />
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;