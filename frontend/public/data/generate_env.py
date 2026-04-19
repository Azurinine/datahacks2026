"""
Generates env_by_year.json: { year, avg_temp, avg_ph, vitality_score }

pH sources (in priority order):
  1. Direct measurement (pH1/pH2) — 2014-2015
  2. Calculated from DIC + TA via carbonate equilibrium — 2008-2015
  3. Linear extrapolation from measured trend — remaining years

vitality_score: % of species count OR total individuals vs. first observed year,
  whichever shows a stronger downward trend (more negative slope). Range 0-1.
"""

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[3] / 'data'
OUT_PATH = Path(__file__).resolve().parent / 'env_by_year.json'
SIM_START, SIM_END = 2014, 2026


# ── Carbonate chemistry ────────────────────────────────────────────────────────

def _K1_K2(T_C, S):
    """Lueker et al. (2000) K1/K2 for seawater (mol/kg-sw)."""
    T_K = T_C + 273.15
    pK1 = 3633.86/T_K - 61.2172 + 9.6777*math.log(T_K) - 0.011555*S + 0.0001152*S**2
    pK2 = 471.78/T_K + 25.9290 - 3.16967*math.log(T_K) - 0.01781*S + 0.0001122*S**2
    return 10**(-pK1), 10**(-pK2)


def _Kw(T_C, S):
    """Millero (1995) water dissociation constant."""
    T_K = T_C + 273.15
    lnKw = (-13847.26/T_K + 148.9652 - 23.6521*math.log(T_K)
            + (118.67/T_K - 5.977 + 1.0495*math.log(T_K)) * S**0.5
            - 0.01615*S)
    return math.exp(lnKw)


def calc_pH(DIC_umol, TA_umol, T_C, S):
    """
    Solve for pH given DIC (µmol/kg), TA (µmol/kg), temperature (°C),
    salinity (PSU) using bisection on the carbonate alkalinity equation.
    """
    DIC = DIC_umol * 1e-6
    TA  = TA_umol  * 1e-6
    K1, K2 = _K1_K2(T_C, S)
    Kw = _Kw(T_C, S)

    def residual(H):
        CA = DIC * (K1*H + 2*K1*K2) / (H**2 + K1*H + K1*K2)
        return CA + Kw/H - H - TA

    # Bisect over pH 6–9 (H = 1e-9 to 1e-6)
    lo, hi = 1e-9, 1e-6
    if residual(lo) * residual(hi) > 0:
        return None
    for _ in range(60):
        mid = (lo + hi) / 2
        if residual(lo) * residual(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return -math.log10((lo + hi) / 2)


# ── Load data ──────────────────────────────────────────────────────────────────

cast_year = {}
with (DATA_DIR / 'cast.csv').open(encoding='latin-1') as f:
    for row in csv.DictReader(f):
        cst = row.get('Cst_Cnt', '').strip()
        yr  = row.get('Year', '').strip()
        if cst and yr:
            try:
                cast_year[cst] = int(float(yr))
            except ValueError:
                pass

year_temps = defaultdict(list)
year_phs   = defaultdict(list)

with (DATA_DIR / 'bottle.csv').open(encoding='latin-1') as f:
    for row in csv.DictReader(f):
        cst  = row.get('Cst_Cnt', '').strip()
        year = cast_year.get(cst)
        if year is None:
            continue

        # Temperature
        try:
            year_temps[year].append(float(row['T_degC']))
        except (ValueError, KeyError):
            pass

        # pH: direct measurement first
        ph_direct = None
        for col in ('pH1', 'pH2'):
            try:
                v = float(row.get(col, ''))
                if 7.0 < v < 9.0:
                    ph_direct = v
                    break
            except ValueError:
                pass

        if ph_direct is not None:
            year_phs[year].append(ph_direct)
            continue

        # pH: calculate from DIC + TA
        try:
            DIC = float(row['DIC1'])
            TA  = float(row['TA1'])
            T   = float(row['T_degC'])
            S   = float(row['Salnty'])
            if DIC > 0 and TA > 0 and 0 < T < 40 and 0 < S < 45:
                ph = calc_pH(DIC, TA, T, S)
                if ph and 7.0 < ph < 9.0:
                    year_phs[year].append(ph)
        except (ValueError, KeyError, TypeError):
            pass

# ── Vitality: species count & individual count from coral.csv ─────────────────

year_species   = defaultdict(set)
year_individ   = defaultdict(int)

with (DATA_DIR / 'coral.csv').open(encoding='utf-8') as f:
    for row in csv.DictReader(f):
        yr  = row.get('ObservationYear', '').strip()
        sci = row.get('ScientificName', '').strip()
        cnt = row.get('IndividualCount', '').strip()
        if not yr or not sci or not cnt:
            continue
        try:
            year_species[int(yr)].add(sci)
            year_individ[int(yr)] += int(float(cnt))
        except ValueError:
            pass

def _linreg_slope(xs, ys):
    n = len(xs)
    xm, ym = sum(xs)/n, sum(ys)/n
    denom = sum((x-xm)**2 for x in xs)
    return sum((x-xm)*(y-ym) for x,y in zip(xs,ys)) / denom if denom else 0

obs_years = sorted(year_species)
first_year = obs_years[0]
sp_raw = [len(year_species[y]) for y in obs_years]
in_raw = [year_individ[y]      for y in obs_years]

sp_slope = _linreg_slope(obs_years, sp_raw)
in_slope = _linreg_slope(obs_years, in_raw)

# Use whichever metric trends more downward (more negative slope per unit)
sp_slope_pct = sp_slope / sp_raw[0]
in_slope_pct = in_slope / in_raw[0]
chosen_metric = 'species_count'
chosen_raw = sp_raw
print(f"   Vitality based on: {chosen_metric}  (sp_slope={sp_slope_pct:.5f}, ind_slope={in_slope_pct:.5f})")

# Fit regression on chosen metric, normalize so 2014 = 1.0
v_xs = obs_years
v_ys = chosen_raw
v_slope     = _linreg_slope(v_xs, v_ys)
v_xm        = sum(v_xs) / len(v_xs)
v_ym        = sum(v_ys) / len(v_xs)
v_intercept = v_ym - v_slope * v_xm
baseline    = v_intercept + v_slope * first_year  # predicted value at 2014

# ── Aggregate by year ──────────────────────────────────────────────────────────

measured_ph   = {y: sum(v)/len(v) for y, v in year_phs.items()   if v}
measured_temp = {y: sum(v)/len(v) for y, v in year_temps.items() if v}

# Linear regression on pH to extrapolate missing simulation years
ph_xs = sorted(measured_ph)
ph_ys = [measured_ph[y] for y in ph_xs]
n = len(ph_xs)
x_mean = sum(ph_xs) / n
y_mean = sum(ph_ys) / n
slope     = sum((x-x_mean)*(y-y_mean) for x,y in zip(ph_xs,ph_ys)) / sum((x-x_mean)**2 for x in ph_xs)
intercept = y_mean - slope * x_mean

# Same for temperature
t_xs = sorted(measured_temp)
t_ys = [measured_temp[y] for y in t_xs]
tn = len(t_xs)
tx_mean = sum(t_xs) / tn
ty_mean = sum(t_ys) / tn
t_slope     = sum((x-tx_mean)*(y-ty_mean) for x,y in zip(t_xs,t_ys)) / sum((x-tx_mean)**2 for x in t_xs)
t_intercept = ty_mean - t_slope * tx_mean

# ── Build output ───────────────────────────────────────────────────────────────

output = []
for year in range(SIM_START, SIM_END + 1):
    avg_ph      = round(measured_ph.get(year,   intercept   + slope   * year), 4)
    avg_temp    = round(measured_temp.get(year, t_intercept + t_slope * year), 4)
    raw_vitality = (v_intercept + v_slope * year) / baseline
    vitality     = round(max(0.0, min(1.0, raw_vitality)), 4)
    source = 'measured' if year in measured_ph else 'extrapolated'
    output.append({"year": year, "avg_temp": avg_temp, "avg_ph": avg_ph, "vitality": vitality, "ph_source": source})

with OUT_PATH.open('w', encoding='utf-8') as f:
    json.dump(output, f, indent=2)

print(f"✅ env_by_year.json — {len(output)} years")
print(f"   pH slope: {slope:.5f}/yr  |  temp slope: {t_slope:.5f}°C/yr")
for e in output:
    print(f"  {e['year']}: pH={e['avg_ph']}  temp={e['avg_temp']}°C  vitality={e['vitality']}  ({e['ph_source']})")
