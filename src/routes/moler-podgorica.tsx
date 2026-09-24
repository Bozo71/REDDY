import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/moler-podgorica")(rutaUsluge("/moler-podgorica"));
