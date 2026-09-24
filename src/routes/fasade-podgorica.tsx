import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/fasade-podgorica")(rutaUsluge("/fasade-podgorica"));
