import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/vodoinstalater-podgorica")(rutaUsluge("/vodoinstalater-podgorica"));
