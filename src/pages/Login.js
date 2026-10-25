import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import {
  TextField, Button, Typography, Box,
  InputAdornment, IconButton, Alert, CircularProgress, GlobalStyles
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  Email, Lock, Visibility, VisibilityOff, FlightTakeoff
} from '@mui/icons-material';

/* ───────────────────────── Animations ───────────────────────── */

// Page-load entrance (used once, staggered)
const riseIn = keyframes`
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Logo gently floating like a plane in the air
const float = keyframes`
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-8px) rotate(-3deg); }
`;

// Moving gradient border on focused inputs
const borderFlow = keyframes`
  0%   { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
`;

// Error shake
const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-10px); }
  40%      { transform: translateX(8px); }
  60%      { transform: translateX(-6px); }
  80%      { transform: translateX(4px); }
`;

// Error alert pop
const popIn = keyframes`
  from { opacity: 0; transform: scale(0.92) translateY(-6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
`;

// Plane flying across the button while signing in
const flyAcross = keyframes`
  0%   { transform: translate(-46px, 6px) rotate(0deg);  opacity: 0; }
  25%  { opacity: 1; }
  100% { transform: translate(60px, -14px) rotate(-8deg); opacity: 0; }
`;

// Button gradient drifting while loading
const gradientDrift = keyframes`
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

/* ───────────────────────── Shared styles ───────────────────────── */

// Wrap every animation so it is skipped for people who prefer reduced motion
const motionOK = '@media (prefers-reduced-motion: no-preference)';

const glassField = {
  position: 'relative',
  borderRadius: '14px',
  bgcolor: 'rgba(255, 255, 255, 0.10)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  transition: 'background-color .25s ease, transform .25s ease, box-shadow .25s ease',
  // The input fills the whole field; icons sit on top of it (so autofill colors the full field)
  pl: 0,
  pr: 0,
  input: { color: '#fff', fontWeight: 500, py: 2, pl: '52px', pr: '52px', borderRadius: '14px' },
  '& .MuiInputAdornment-positionStart': {
    position: 'absolute',
    left: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    margin: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  '& .MuiInputAdornment-positionEnd': {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    margin: 0,
    zIndex: 1,
  },
  '& input::placeholder': { color: 'rgba(255,255,255,0.7)', opacity: 1 },
  '& fieldset': { border: 'none' },

  // Fix Chrome autofill turning the field white
  // Chrome's autofill background can't be removed, so cover it with a matching solid color
  '& input:-webkit-autofill, & input:-webkit-autofill:hover, & input:-webkit-autofill:focus': {
    WebkitBoxShadow: '0 0 0 100px #3b5b86 inset',
    WebkitTextFillColor: '#fff',
    caretColor: '#fff',
    borderRadius: 'inherit',
  },

  '&:hover': {
    bgcolor: 'rgba(255, 255, 255, 0.16)',
    transform: 'translateY(-1px)',
  },

  // Animated gradient ring (only visible on focus)
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    padding: '2px',
    background: 'linear-gradient(120deg, #4fc3f7, #ffffff, #ffab91, #4fc3f7)',
    backgroundSize: '300% 100%',
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
    opacity: 0,
    transition: 'opacity .3s ease',
    pointerEvents: 'none',
    [motionOK]: { animation: `${borderFlow} 3.5s linear infinite` },
  },

  '&.Mui-focused': {
    bgcolor: 'rgba(255, 255, 255, 0.20)',
    boxShadow: '0 0 0 4px rgba(79, 195, 247, 0.18), 0 10px 30px rgba(0, 0, 0, 0.25)',
    '&::before': { opacity: 1 },
  },
};

// Icon that lights up and lifts when its field is focused
const fieldIcon = {
  color: 'rgba(255,255,255,0.7)',
  transition: 'color .25s ease, transform .35s cubic-bezier(.34,1.56,.64,1)',
  '.Mui-focused &': {
    color: '#4fc3f7',
    transform: 'scale(1.18) rotate(-6deg)',
  },
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shaking, setShaking] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
      setShaking(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  // Staggered entrance helper
  const enter = (delay) => ({
    [motionOK]: { animation: `${riseIn} .7s cubic-bezier(.22,1,.36,1) ${delay}s both` },
  });

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: '"Outfit", "Roboto", "Helvetica", "Arial", sans-serif',
      }}
    >
      {/* Loads the Outfit font (the old '@import' inside sx does not work in MUI) */}
      <GlobalStyles
        styles={{
          '@import': "url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap')",
        }}
      />

      {/* ─── BACKGROUND IMAGE ─── */}
      <img
        src="/Login_background.png"
        alt="Travel Background"
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: -1,
        }}
      />

      {/* ─── DARK OVERLAY ─── */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 100%)',
          zIndex: 0,
        }}
      />

      {/* ─── LOGIN CONTENT ─── */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          overflowY: 'auto',
        }}
      >
       {/* ─── LOGIN CARD (the bordered rectangle) ─── */}
       <Box
        sx={{
          width: '100%',
          maxWidth: 440,
          my: 'auto',
          px: { xs: 3, sm: 5 },
          py: { xs: 3, sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderRadius: '28px',
          bgcolor: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1.5px solid rgba(255, 255, 255, 0.45)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
        }}
       >
        {/* Logo & Title */}
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          mb={3}
          sx={enter(0)}
        >
          <Box
            sx={{
              bgcolor: '#ffffff',
              color: '#1976d2',
              p: 2.5,
              borderRadius: '50%',
              mb: 2,
              display: 'flex',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
              [motionOK]: { animation: `${float} 4s ease-in-out infinite` },
            }}
          >
            <FlightTakeoff fontSize="large" />
          </Box>
          <Typography
            variant="h3"
            fontWeight="800"
            color="#ffffff"
            sx={{ textShadow: '0px 4px 10px rgba(0,0,0,0.5)', letterSpacing: '-1px' }}
          >
            Travel Wings
          </Typography>
          <Typography variant="h6" color="rgba(255,255,255,0.8)" fontWeight="400" sx={{ mt: 1 }}>
            Welcome Back
          </Typography>
        </Box>

        {/* Error Message */}
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              width: '100%',
              borderRadius: 3,
              bgcolor: 'rgba(253, 237, 237, 0.95)',
              [motionOK]: { animation: `${popIn} .35s cubic-bezier(.34,1.56,.64,1) both` },
            }}
          >
            {error}
          </Alert>
        )}

        {/* Form (shakes when login fails) */}
        <form
          onSubmit={handleLogin}
          style={{ width: '100%' }}
        >
          <Box
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setShaking(false);
            }}
            sx={{
              [motionOK]: shaking ? { animation: `${shake} .5s ease-in-out` } : {},
            }}
          >
            <Box sx={enter(0.15)}>
              <TextField
                placeholder="Email Address"
                variant="outlined"
                fullWidth
                margin="dense"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={fieldIcon} />
                    </InputAdornment>
                  ),
                  sx: glassField,
                }}
              />
            </Box>

            <Box sx={enter(0.3)}>
              <TextField
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                fullWidth
                margin="dense"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={fieldIcon} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleClickShowPassword}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        sx={{
                          color: 'rgba(255,255,255,0.7)',
                          transition: 'transform .3s cubic-bezier(.34,1.56,.64,1), color .2s',
                          '&:hover': { color: '#fff', transform: 'rotate(15deg) scale(1.15)' },
                          '&:active': { transform: 'scale(0.9)' },
                        }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: glassField,
                }}
              />
            </Box>

            {/* ─── SIGN IN BUTTON ─── */}
            <Box sx={enter(0.45)}>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{
                  mt: 4,
                  py: 2,
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '30px',
                  textTransform: 'none',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.3px',
                  fontFamily: '"Outfit", sans-serif',
                  color: '#fff',
                  background: 'linear-gradient(90deg, #1976d2, #29b6f6, #1976d2)',
                  backgroundSize: '200% 100%',
                  backgroundPosition: '0% 50%',
                  boxShadow: '0 8px 24px rgba(25, 118, 210, 0.45)',
                  transition:
                    'background-position .6s ease, transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .25s ease',

                  // Light sweep across the button on hover
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: '-60%',
                    width: '40%',
                    height: '100%',
                    background:
                      'linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent)',
                    transform: 'skewX(-20deg)',
                    pointerEvents: 'none',
                  },

                  '&:hover': {
                    backgroundPosition: '100% 50%',
                    transform: 'translateY(-3px) scale(1.02)',
                    boxShadow: '0 14px 34px rgba(41, 182, 246, 0.55)',
                    '&::after': {
                      left: '130%',
                      transition: 'left .8s ease',
                    },
                    // plane takes a little hop forward
                    '& .btn-plane': {
                      transform: 'translateX(8px) translateY(-3px) rotate(-8deg)',
                    },
                    '& .btn-label': { transform: 'translateX(-4px)' },
                  },

                  '&:active': {
                    transform: 'translateY(0) scale(0.97)',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.4)',
                  },

                  '&:focus-visible': {
                    outline: '3px solid rgba(255,255,255,0.8)',
                    outlineOffset: '3px',
                  },

                  // While signing in: keep gradient moving, don't grey out
                  '&.Mui-disabled': {
                    color: '#fff',
                    background: 'linear-gradient(90deg, #1976d2, #29b6f6, #1976d2)',
                    backgroundSize: '200% 100%',
                    [motionOK]: { animation: `${gradientDrift} 1.4s linear infinite` },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.2 }}
                >
                  <Box
                    component="span"
                    className="btn-label"
                    sx={{ transition: 'transform .3s ease' }}
                  >
                    {loading ? 'Boarding…' : 'Sign in'}
                  </Box>

                  <Box
                    component="span"
                    className="btn-plane"
                    sx={{
                      display: 'inline-flex',
                      transition: 'transform .4s cubic-bezier(.34,1.56,.64,1)',
                      [motionOK]: loading
                        ? { animation: `${flyAcross} 1.1s ease-in infinite` }
                        : {},
                    }}
                  >
                    <FlightTakeoff sx={{ fontSize: 24 }} />
                  </Box>
                </Box>
              </Button>
            </Box>
          </Box>
        </form>
       </Box>
      </Box>
    </Box>
  );
};

export default Login;