# Local fault simulation engine

Run from the project root:

```powershell
python local_engine/server.py
```

Open `http://127.0.0.1:8765`. The service hosts `dist/` and provides:

- `GET /api/health`
- `GET /api/descriptors`
- `POST /api/descriptors`
- `POST /api/simulate`
- `POST /api/synthesize`
- `GET /api/results/latest`

Simulation results are written to `local_engine/results/`. User descriptors are
stored in `local_engine/user_descriptors.json`; both paths are ignored by Git.

Run tests with:

```powershell
python -m unittest local_engine/test_simulator.py
```
