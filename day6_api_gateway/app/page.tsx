import ApiGatewayUI from './_components/ApiGatewayUI';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-12 lg:p-24">
      <div className="z-10 w-full max-w-7xl items-center justify-between font-mono text-sm lg:flex mb-8">
        <h1 className="text-2xl font-bold text-center lg:text-left w-full">
          Day 6: API Gateway Dashboard
        </h1>
      </div>

      <ApiGatewayUI />

    </main>
  );
}
